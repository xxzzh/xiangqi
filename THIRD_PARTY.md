# 复用来源与许可

本项目基于 [vinybnb/xiangqi](https://github.com/vinybnb/xiangqi) 改进。
基础提交：`28ee5889a3098f2555bce0467573d5a08f1859ef`。保留上游 MIT `LICENSE`。
`public/rules.js` 的基础走法生成、`public/game.js` 的 SVG 棋盘绘制源自该项目。
本次增加了中文练习界面、真实人机应招、固定红方视角评分、棋谱跟练与变招接管、中文/PGN 导入、历史回看、评分差反馈与自动保存；重写了引擎请求调度，保留历史着法，并隔离不同页面的引擎状态。

引擎使用官方 [Pikafish 2026-09-06](https://github.com/official-pikafish/Pikafish/releases/tag/Pikafish-2026-09-06)，未修改引擎源码。
对应完整源码：[该版本标签](https://github.com/official-pikafish/Pikafish/tree/Pikafish-2026-09-06)。
本地 `engine/` 保留发布包中的 `Copying.txt`、`NNUE-License.md` 和 `AUTHORS`。
引擎为 GPL-3.0；官方 NNUE 权重有单独使用条款，包含未经许可不得商用。本次用途为个人本地学习。
引擎二进制和权重不纳入本项目 Git；如后续分发，请随附原许可及准确对应的源码获取方式。

内置三条短棋谱为开局走法演练示例，不标注为名家实战或唯一最佳变化。
