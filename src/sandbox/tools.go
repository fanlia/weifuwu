package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ── 路径穿越防护（容器内防线——复刻 JS safePath：resolve 必须在 /ws 内）──
// SANDBOX_WS env 可覆盖（测试面——容器内恒 /ws 挂载点）
func wsRoot() string {
	if v := os.Getenv("SANDBOX_WS"); v != "" {
		return v
	}
	return "/ws"
}

func safePath(rel string) (string, error) {
	ws := wsRoot()
	resolved := filepath.Clean(filepath.Join(ws, relOrDot(rel)))
	if resolved != ws && !strings.HasPrefix(resolved, ws+"/") {
		return "", fmt.Errorf("路径 %q 超出了工作空间范围", rel)
	}
	return resolved, nil
}

func relOrDot(rel string) string {
	if rel == "" {
		return "."
	}
	return rel
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + fmt.Sprintf("\n... (输出过长，截断至 %d 字符，总长 %d)", max, len(s))
}

// ── 工具分发（六工具——Go 原生实现）──
// 返回 (输出, ok)。ok=false = 工具失败（{ok:false, error}——AI 可感知的重试语义）
func dispatch(tool string, args map[string]interface{}) (string, bool) {
	switch tool {
	case "read":
		return tRead(args)
	case "write":
		return tWrite(args)
	case "edit":
		return tEdit(args)
	case "grep":
		return tGrep(args)
	case "list_files":
		return tList(args)
	case "bash":
		return tBash(args)
	default:
		return "未知工具: " + tool, false
	}
}

func str(args map[string]interface{}, key string) string {
	v, _ := args[key].(string)
	return v
}

func tRead(args map[string]interface{}) (string, bool) {
	rel := str(args, "path")
	if rel == "" {
		return "请提供文件路径", false
	}
	abs, err := safePath(rel)
	if err != nil {
		return "读取失败: " + err.Error(), false
	}
	b, err := os.ReadFile(abs)
	if err != nil {
		return "读取失败: " + err.Error(), false
	}
	content := string(b)
	if len(content) == 0 {
		return "(空文件)", true
	}
	return truncate(content, 50*1024), true
}

func tWrite(args map[string]interface{}) (string, bool) {
	rel := str(args, "path")
	content := str(args, "content")
	if rel == "" {
		return "请提供文件路径", false
	}
	abs, err := safePath(rel)
	if err != nil {
		return "写入失败: " + err.Error(), false
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return "写入失败: " + err.Error(), false
	}
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		return "写入失败: " + err.Error(), false
	}
	return fmt.Sprintf("已写入 %s (%d 字符)", rel, len(content)), true
}

func tEdit(args map[string]interface{}) (string, bool) {
	rel := str(args, "path")
	oldText := str(args, "oldText")
	newText := str(args, "newText")
	if rel == "" || oldText == "" {
		return "请提供文件路径和 oldText", false
	}
	abs, err := safePath(rel)
	if err != nil {
		return "编辑失败: " + err.Error(), false
	}
	b, err := os.ReadFile(abs)
	if err != nil {
		return "编辑失败: " + err.Error(), false
	}
	content := string(b)
	idx := strings.Index(content, oldText)
	if idx == -1 {
		return "未找到匹配的 oldText，请精确匹配", false
	}
	newContent := strings.Replace(content, oldText, newText, 1)
	if err := os.WriteFile(abs, []byte(newContent), 0o644); err != nil {
		return "编辑失败: " + err.Error(), false
	}
	return fmt.Sprintf("已编辑 %s (替换了 %d → %d 字符)", rel, len(oldText), len(newText)), true
}

func tList(args map[string]interface{}) (string, bool) {
	rel := str(args, "path")
	abs, err := safePath(rel)
	if err != nil {
		return "列出目录失败: " + err.Error(), false
	}
	entries, err := os.ReadDir(abs)
	if err != nil {
		return "列出目录失败: " + err.Error(), false
	}
	var items []string
	for _, e := range entries {
		if e.IsDir() {
			items = append(items, "📁 "+e.Name()+"/")
			continue
		}
		info, err := e.Info()
		if err != nil {
			items = append(items, "📄 "+e.Name())
			continue
		}
		size := info.Size()
		var sizeStr string
		if size > 1024 {
			sizeStr = fmt.Sprintf("%.1fKB", float64(size)/1024)
		} else {
			sizeStr = fmt.Sprintf("%dB", size)
		}
		items = append(items, fmt.Sprintf("📄 %s (%s)", e.Name(), sizeStr))
	}
	sortStrings(items)
	if len(items) == 0 {
		return "(空目录)", true
	}
	return strings.Join(items, "\n"), true
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}

// grep：递归（跳过隐藏目录 + node_modules）——顶部 10 条 + 计数——复刻 JS
func tGrep(args map[string]interface{}) (string, bool) {
	pattern := str(args, "pattern")
	rel := str(args, "path")
	if pattern == "" {
		return "请提供搜索模式", false
	}
	if rel == "" {
		rel = "."
	}
	abs, err := safePath(rel)
	if err != nil {
		return "搜索失败: " + err.Error(), false
	}
	results := []string{}
	var walk func(fp, relToWs string)
	walk = func(fp, relToWs string) {
		if len(results) >= 100000 {
			return
		}
		info, err := os.Stat(fp)
		if err != nil {
			return
		}
		if info.IsDir() {
			entries, err := os.ReadDir(fp)
			if err != nil {
				return
			}
			for _, e := range entries {
				name := e.Name()
				if strings.HasPrefix(name, ".") || name == "node_modules" {
					continue
				}
				walk(filepath.Join(fp, name), filepath.Join(relToWs, name))
			}
			return
		}
		b, err := os.ReadFile(fp)
		if err != nil {
			return
		}
		lines := strings.Split(string(b), "\n")
		for i, line := range lines {
			if strings.Contains(line, pattern) {
				text := strings.TrimSpace(line)
				if len(text) > 200 {
					text = text[:200]
				}
				results = append(results, fmt.Sprintf("%s:%d | %s", relToWs, i+1, text))
			}
		}
	}
	if info, _ := os.Stat(abs); info != nil && info.IsDir() {
		base := ""
		if rel != "." {
			base = rel
		}
		walk(abs, base)
	} else {
		b, err := os.ReadFile(abs)
		if err == nil {
			for i, line := range strings.Split(string(b), "\n") {
				if strings.Contains(line, pattern) {
					text := strings.TrimSpace(line)
					if len(text) > 200 {
						text = text[:200]
					}
					results = append(results, fmt.Sprintf("%s:%d | %s", rel, i+1, text))
				}
			}
		}
	}
	if len(results) == 0 {
		return "未找到匹配", true
	}
	top10 := results
	if len(top10) > 10 {
		top10 = top10[:10]
	}
	output := strings.Join(top10, "\n")
	if len(results) > 10 {
		output += fmt.Sprintf("\n... 还有 %d 处匹配", len(results)-10)
	}
	return output, true
}
