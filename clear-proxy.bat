@echo off
echo === 清除代理环境变量 ===

:: 清除当前会话的代理设置
set HTTP_PROXY=
set HTTPS_PROXY=
set NO_PROXY=
set http_proxy=
set https_proxy=
set no_proxy=
set ALL_PROXY=
set all_proxy=

echo ✓ 已清除当前会话的代理环境变量

echo.
echo === 验证清除结果 ===
set | findstr /i proxy

echo.
echo === 启动开发服务器 ===
npx wrangler dev --local --port 8787

pause