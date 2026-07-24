# 开发计划

## 里程碑

### M1 工程骨架

- Tauri 2 + React + TypeScript + Vite
- FullCalendar 集成
- Markdown 编辑和预览
- 本地 SQLite API

### M2 核心体验

- 日程表单打磨
- 日、周、月、年视图交互
- 搜索与今日列表
- JSON 导出

### M3 提醒

- 通知权限请求
- 运行时轮询到期提醒
- 已通知状态记录

### M4 发布

- Ubuntu 本地打包
- Windows 打包验证
- GitHub Release 手动上传安装包

## 测试策略

- 前端：`npm run build` 保证类型和构建通过
- Rust：`cargo check` 保证 Tauri 命令和数据层可编译
- 手动验收：覆盖主要用户流程
- 后续增加 Rust 数据层单元测试，重点覆盖保存、更新、删除、提醒查询和导出

## 发布策略

第一版采用手动发布：

1. 本地执行 `npm run build`
2. 本地执行 `npx tauri build`
3. 在 GitHub Release 上传 Ubuntu 安装包
4. Windows 打包在 Windows 环境单独验证

GitHub Actions 自动打包放到第二阶段。
