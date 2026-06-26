#!/usr/bin/env bash
# 一键同步代码到飞牛 NAS（通过 SMB 挂载点）
#
# 用法：在项目根目录跑 `./sync-to-nas.sh`
# 首次使用前：
#   1. Finder ⌘K 挂载 NAS SMB 共享盘
#   2. 改下面的 NAS_TARGET 为你 NAS 上实际的项目目录
set -euo pipefail

# ====================================================================
# 配置区：改成你 NAS 上实际的目标路径（必须是 Mac 上能看到的挂载路径）
# 例：/Volumes/home/docker/caiwumanager
# 例：/Volumes/storage/docker/caiwumanager
# ====================================================================
NAS_TARGET="/Volumes/<挂载点>/docker/caiwumanager"

# 项目根目录（脚本所在目录）
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# ====================================================================
# 前置检查
# ====================================================================
if [[ "$NAS_TARGET" == *"<挂载点>"* ]]; then
  echo "❌ 请先编辑本脚本，把 NAS_TARGET 改成实际的挂载路径"
  echo "   当前是占位符：$NAS_TARGET"
  exit 1
fi

if [[ ! -d "$NAS_TARGET" ]]; then
  echo "❌ 目标目录不存在或 SMB 未挂载：$NAS_TARGET"
  echo "   请先在 Finder 用 ⌘K 挂载 NAS 共享盘，并确认目录已建好"
  exit 1
fi

echo "📦 项目根目录: $PROJECT_ROOT"
echo "🎯 NAS 目标   : $NAS_TARGET"
echo ""
echo "▶ 开始同步（首次会传比较多，后续都是增量）..."
echo ""

# ====================================================================
# 同步
# --archive : 保留权限、时间戳等
# --verbose : 显示传输的文件
# --human-readable : 人类可读的大小
# --delete  : 删除 NAS 上源端已经不存在的文件（保持两边一致）
# --no-perms / --no-owner / --no-group : SMB 不支持 unix 权限，跳过避免警告
# --exclude : 排除本地特有的目录和文件
# ====================================================================
rsync \
  --archive \
  --verbose \
  --human-readable \
  --delete \
  --no-perms --no-owner --no-group \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'data/' \
  --exclude '.env' \
  --exclude '.DS_Store' \
  --exclude '._*' \
  --exclude '.vite/' \
  --exclude '*.log' \
  "$PROJECT_ROOT/" "$NAS_TARGET/"

echo ""
echo "✅ 同步完成"
echo ""
echo "下一步："
echo "  1. 第一次部署：去飞牛 Container Manager → 项目 → 新建，路径选 NAS 上对应目录"
echo "  2. 后续更新  ：在 Container Manager 找到 caiwumanager 项目，点「重新构建」即可"
