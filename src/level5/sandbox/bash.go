package main

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const MaxBashOutput = 100 * 1024 // bash 100KB（截断上限）
const BashTimeoutSecs = 30       // 内部默认超时（外层 docker exec 注入优先）

// bash 工具（进程组超时杀树——复刻 JS tool-runner.js P0-3 语义）：
//   - spawn Setpgid = 新进程组 → kill(-pid) 杀全组（sh + 全部后代）——不留孤儿
//   - 内部超时 = 外层（SANDBOX_EXEC_TIMEOUT_SECS）− 2s（至少 1s——必须严格
//     小于外层，否则与外层 timeout 同时触发：race 下外层先杀 agent，timer
//     无机会执行，进程组残留）
//   - exitCode != 0 = 工具失败（{ok:false} 协议——AI 可感知的重试语义）
//   - 输出截断 100KB；网络隔离提示（诚实裁剪前置——防 AI 反复重试）
func tBash(args map[string]interface{}) (string, bool) {
	command := str(args, "command")
	if command == "" {
		return "请提供命令", false
	}
	outerSecs, _ := strconv.Atoi(os.Getenv("SANDBOX_EXEC_TIMEOUT_SECS"))
	var bashTimeout time.Duration
	if outerSecs > 0 {
		s := outerSecs - 2
		if s < 1 {
			s = 1
		}
		bashTimeout = time.Duration(s) * time.Second
	} else {
		bashTimeout = BashTimeoutSecs * time.Second
	}

	cmd := exec.Command("sh", "-c", command)
	cmd.Dir = wsRoot()
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Env = []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"HOME=/home/node",
		"LANG=C.UTF-8",
	}
	activeChildren[cmd] = true
	defer delete(activeChildren, cmd)

	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return fmt.Sprintf("命令执行失败: %s", stderr.String()), false
	}

	timedOut := false
	timer := time.AfterFunc(bashTimeout, func() {
		timedOut = true
		_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	})
	err := cmd.Wait()
	timer.Stop()

	if timedOut {
		return fmt.Sprintf("命令执行超时（%ds）——沙盒已终止该命令", int(bashTimeout/time.Second)), false
	}
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			out := stdout.String()
			if len(out) > 4000 {
				out = out[:4000]
			}
			return fmt.Sprintf("命令执行失败: %s%s",
				firstNonEmpty(strings.TrimSpace(stderr.String()), fmt.Sprintf("exit %d", ee.ExitCode())),
				nonEmptySuffix("stdout", out)), false
		}
		return fmt.Sprintf("命令执行失败: %v", err), false
	}
	out := strings.TrimSpace(stdout.String())
	errOut := strings.TrimSpace(stderr.String())
	var result string
	if out != "" {
		result = truncate(out, MaxBashOutput)
	}
	if errOut != "" {
		if result != "" {
			result += "\n\n--- stderr ---\n" + errOut
		} else {
			result = errOut
		}
	}
	if result == "" {
		result = "命令执行成功（无输出）"
	}
	// 网络隔离提示
	if rxNetworkFail.MatchString(result) {
		result += "\n\n（提示：沙盒默认无网络（--network none）——网络类命令会失败；如需网络请管理员在 Agent 配置开启 allow_network）"
	}
	return result, true
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func nonEmptySuffix(prefix, s string) string {
	if s == "" {
		return ""
	}
	return fmt.Sprintf(" (stdout: %s)", s)
}
