# VK DPI Proxy Helper（浏览器插件）

Chrome / Edge 扩展：仅把 VK 相关域名走本地代理 `127.0.0.1:8888`，其它网站直连。

须与本地软件 [vk-dpi-proxy](https://github.com/secure-artifacts/vk-dpi-proxy) 一起使用。

## 安装（开发 / 本地文件夹）

1. 启动本地软件并点「启动」
2. 打开 `chrome://extensions`（Edge：`edge://extensions`）
3. 开启「开发者模式」→「加载已解压的扩展程序」→ 选择本仓库目录
4. 点插件图标 →「开启」→ 打开 https://vk.com

## 从 Release 安装

1. 在 [Releases](https://github.com/secure-artifacts/vk-dpi-extension/releases) 下载 `vk-dpi-extension-vX.Y.Z.zip`
2. （可选）校验：`gh attestation verify vk-dpi-extension-vX.Y.Z.zip --owner secure-artifacts`
3. 解压到稳定目录（不要再移动）
4. `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选解压目录

## 如何发布新版本

本项目使用 GitHub Actions 自动构建和发布。每次发布新版本只需要创建一个 Git Tag 并推送即可。

### 发布步骤

#### 1. 确保代码已提交并推送

```bash
git status
git add .
git commit -m "你的改动说明"
git push origin main
```

#### 2. 创建版本 Tag

版本号格式为 `v主版本.次版本.修订版本`，例如 `v1.0.0`。

```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
```

同步更新 `manifest.json` 里的 `"version"` 字段（如 `1.0.0`），再提交推送。

#### 3. 推送 Tag 触发自动构建

```bash
git push origin v1.0.0
```

推送后，GitHub Actions 会自动打包 zip、生成 Attestation、创建 Release。

#### 4. 查看构建结果

- 构建进度：仓库 **Actions** 页面
- 发布结果：仓库 **Releases** 页面

### 版本号说明

| 版本号格式 | 什么时候用 | 示例 |
|-----------|-----------|------|
| `vX.0.0` | 重大更新 | `v2.0.0` |
| `vX.Y.0` | 新增功能 | `v1.1.0` |
| `vX.Y.Z` | 修复 bug | `v1.0.1` |

### 如果构建失败怎么办

```bash
git tag -d v1.0.0
git push origin :refs/tags/v1.0.0
# 修复后
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```
