# 我的日历

本地优先的个人桌面日历。第一版面向 Ubuntu/Linux 开发与使用，Windows 作为第二优先级，macOS 暂不承诺完整打包验证。

## 第一版范围

- 日、周、月、年视图查看日程
- 日历日期格显示农历和节气
- 日历日期格显示中国法定节假日和调休上班日
- 快速创建和编辑日程
- Markdown 正文编辑与预览，支持 GFM checklist、表格、链接和代码块
- 本地 SQLite 持久化
- 应用运行时桌面系统通知
- JSON 导入和导出备份

第一版暂不做账号系统、多人协作、重复规则、后台常驻、开机自启动、ICS 导入导出和云同步。

## 技术栈

- 桌面框架：Tauri 2
- 前端：React、TypeScript、Vite
- 日历视图：FullCalendar
- Markdown：react-markdown、remark-gfm
- 本地存储：Rust + rusqlite + SQLite
- 通知：Tauri notification plugin

## 开发命令

```bash
npm install
npm run build
npx tauri dev
```

Ubuntu 构建 Tauri 通常需要系统依赖：

```bash
sudo apt update
sudo apt install -y pkg-config libdbus-1-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev
```

## 数据位置

运行后数据库保存到系统应用数据目录下的 `my-calendar.sqlite3`。JSON 导出会写入同一数据目录的 `exports/` 子目录。

## 验证

```bash
npm run build
cd src-tauri
cargo check
```

当前环境中 `cargo check` 需要先安装 Ubuntu 系统开发库。
