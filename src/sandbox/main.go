// sandbox-agent——沙盒容器 PID 1 常驻入口（Go 版——2027-09）
//
// 设计（对照 JS 版 sandbox-agent.js 语义——协议零漂移）：
//   - PID 1 = agent：显式信号处理（SIGTERM/SIGINT → 杀活跃子进程组 → 秒退）
//   - argv 转发：`docker run 镜像 <cmd>` —— 子进程执行（stdio inherit——统一
//     镜像 CLI 语义——调试/运维直接 exec 命令）
//   - 常驻：HTTP 面（/healthz /capabilities /stats——127.0.0.1:5711）+ stdin
//     协议（JSON {tool, args} → JSON {ok, output|error}——平台 docker exec
//     路径不变）
//   - 工具执行：read/write/edit/grep/list_files/bash——Go 原生实现（os/io——
//     路径穿越防护 safePath 锁 /ws；bash 进程组超时杀树 kill(-pid)——不留
//     孤儿；输出截断/超时语义/网络提示——全部对齐 JS tool-runner.js）
//
// 环境：镜像保留 node + python（环境命令——AI 可跑脚本）；Go agent 单二进制
// 烧入。安全边界 = 容器（safePath——即使宿主 bug 也逃不出卷）。
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
)

const (
	Port = 5711
	host = "127.0.0.1"
)

// ── 信号处理（复刻 JS 版：杀活跃子进程树 → 100ms 排空 → exit(0)）──
var activeChildren = map[*exec.Cmd]bool{}
var shuttingDown = false

func shutdown(sig string) {
	if shuttingDown {
		return
	}
	shuttingDown = true
	fmt.Printf("[sandbox-agent] 收到 %s——优雅关闭（杀 %d 活跃子进程）\n", sig, len(activeChildren))
	for c := range activeChildren {
		if c.Process == nil {
			continue
		}
		pid := c.Process.Pid
		// 进程组（Setpgid 的组长）——kill(-pid) 杀全组（bash 的 sh+后代）
		_ = syscall.Kill(-pid, syscall.SIGKILL)
		_ = c.Process.Kill()
	}
	// 短留排空（stdin/flush）——然后退出（exit 0——docker 视为干净）
	sleepMs(100)
	os.Exit(0)
}

func main() {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		s := <-sigCh
		shutdown(s.String())
	}()

	// ── exec 子命令（单次执行器——平台 docker exec 调用面：
	//    `sandbox-agent exec`——stdin JSON {tool,args} → stdout JSON——与
	//    tool-runner.js 同协议（platform docker.ts 一行替换）——每次 exec 起
	//    Go 进程（~5ms）替代 node 冷启（~50ms））
	if len(os.Args) > 1 && os.Args[1] == "exec" {
		execOnce()
		return
	}
	// ── argv 转发（优先）：`docker run 镜像 <cmd>` → 子进程（stdio inherit）──
	if len(os.Args) > 1 {
		runArgvCommand(os.Args[1:])
		return
	}
	// 常驻 agent：HTTP 面 + stdin 协议
	startAgent()
}

// ── argv 转发：子进程退出 → agent 同 code 退出 ──
func runArgvCommand(argv []string) {
	cmd := exec.Command(argv[0], argv[1:]...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Dir = "/ws"
	cmd.Env = os.Environ()
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	activeChildren[cmd] = true
	err := cmd.Run()
	delete(activeChildren, cmd)
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			os.Exit(ee.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "[sandbox-agent] 命令启动失败: %v\n", err)
		os.Exit(127)
	}
	os.Exit(0)
}

// ── exec 单次模式（平台 docker exec 面——stdin JSON 一次 → stdout JSON）
//
//	语义与 tool-runner.js 完全一致（fastpath——~5ms 无 node 冷启）
func execOnce() {
	agentLoopReader(os.Stdin)
}

// 共读循环（常驻 stdin 协议与单次 exec 共用）
func agentLoopReader(r io.Reader) {
	reader := bufio.NewReader(r)
	input, err := io.ReadAll(reader)
	if err != nil || len(input) == 0 {
		return
	}
	var req struct {
		Tool string                 `json:"tool"`
		Args map[string]interface{} `json:"args"`
	}
	if jerr := json.Unmarshal(input, &req); jerr != nil || req.Tool == "" {
		output, ok := dispatch("bash", map[string]interface{}{
			"command": strings.TrimSpace(string(input)),
		})
		if ok {
			writeJSON(map[string]any{"ok": true, "output": output})
		} else {
			writeJSON(map[string]any{"ok": false, "error": output})
		}
		return
	}
	output, ok := dispatch(req.Tool, req.Args)
	if ok {
		writeJSON(map[string]any{"ok": true, "output": output})
	} else {
		writeJSON(map[string]any{"ok": false, "error": output})
	}
}
