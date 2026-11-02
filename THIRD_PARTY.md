# 复用来源与许可

本项目基于 [vinybnb/xiangqi](https://github.com/vinybnb/xiangqi) 改进。
基础提交：`28ee5889a3098f2555bce0467573d5a08f1859ef`。保留上游 MIT `LICENSE`。
`public/rules.js` 的基础走法生成、`public/game.js` 的 SVG 棋盘绘制源自该项目。
本次增加了中文练习界面、真实人机应招、固定红方视角评分、棋谱跟练与变招接管、中文/PGN 导入、历史回看、评分差反馈与自动保存；重写了引擎请求调度，保留历史着法，并隔离不同页面的引擎状态。

引擎使用官方 [Pikafish 2026-09-06](https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2026-09-06)，未修改引擎源码。
对应完整源码：[该版本标签](https://github.com/official-pikafish/Pikafish/tree/Pikafish-2026-09-06)。
本地 `engine/` 与 Windows 整合包保留发布包中的 `Copying.txt`、`NNUE-License.md` 和 `AUTHORS`。
引擎为 GPL-3.0；官方 NNUE 权重有单独使用条款，包含未经许可不得商用。本次用途为个人本地学习。
引擎二进制和权重不纳入本项目 Git；从 v1.2.0 起在 Release 的 Windows 整合包中分发未修改的官方文件。包内同时提供 `licenses/Pikafish-2026-09-06-source.tar.gz` 对应源码归档（上游提交 `4c17cee`，包含构建说明与 Makefile），以及官方源码下载地址。

整合包内置官方 Node.js 24.22.2 x64，原始完整许可与内含第三方声明见 `runtime/LICENSE`。运行依赖由项目锁文件固定，原许可保留在各 `node_modules/` 包中，附 `licenses/npm-dependencies.json` 索引。具体分发清单、来源与 SHA256 见 `portable.json`；许可导览见 [docs/portable/LICENSES.md](docs/portable/LICENSES.md)。

内置三条短棋谱为开局走法演练示例，不标注为名家实战或唯一最佳变化。
