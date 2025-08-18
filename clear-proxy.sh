#!/bin/bash

echo "=== 清除代理环境变量 ==="

# 清除当前shell会话的代理设置
unset HTTP_PROXY
unset HTTPS_PROXY  
unset NO_PROXY
unset http_proxy
unset https_proxy
unset no_proxy

# 清除可能的大写版本
unset ALL_PROXY
unset all_proxy

echo "✓ 已清除当前会话的代理环境变量"

# 检查清除结果
echo ""
echo "=== 验证清除结果 ==="
PROXY_VARS=$(printenv | grep -i proxy || echo "无代理环境变量")
echo "$PROXY_VARS"

echo ""
echo "=== 启动开发服务器 ==="
npx wrangler dev --local --port 8787