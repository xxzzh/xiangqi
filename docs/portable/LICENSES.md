# Windows 整合包中的第三方组件

本整合包供个人本地象棋学习使用，不提供对第三方组件的额外授权。

- **应用与上游界面/规则**：MIT，见根目录 `LICENSE` 和 `THIRD_PARTY.md`。
- **Node.js 24.22.2 x64**：未修改的官方运行文件，许可及其内含第三方声明完整保留在 `runtime/LICENSE`。来源：https://nodejs.org/dist/v24.22.2/ 。
- **npm 生产依赖**：版本由 `package-lock.json` 固定。逐项版本、许可证标识及实际许可文件路径见 `licenses/npm-dependencies.json`；许可原文保留在各 `node_modules/` 包中。不含 Electron 等开发依赖。
- **Pikafish 2026-09-06**：未修改的官方 Windows x86-64 universal 引擎。GPL-3.0 原文和作者列表见 `engine/Copying.txt`、`engine/AUTHORS`。官方发布：https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2026-09-06 。
- **对应引擎源码**：本包中 `licenses/Pikafish-2026-09-06-source.tar.gz` 是上述版本的完整上游源码归档，含构建说明和 Makefile。上游标签：https://github.com/official-pikafish/Pikafish/tree/Pikafish-2026-09-06 ，源码提交 `4c17cee`。可解压、修改并按其构建说明重建引擎，再替换 `engine/` 中可执行文件。本包不限制使用修改后的引擎。
- **NNUE 权重**：来自同一官方发布包，未修改，许可原文见 `engine/NNUE-License.md`。该文件包含独立使用条款与未经许可不得商用的限制，不能将整个整合包一概视作仅有 MIT 或 GPL 许可。

构建使用的官方下载地址及 SHA256 保存在根目录 `portable.json`。该文件也记录各分发文件的 SHA256，构建脚本为项目源码中的 `scripts/build-portable.cjs`。
