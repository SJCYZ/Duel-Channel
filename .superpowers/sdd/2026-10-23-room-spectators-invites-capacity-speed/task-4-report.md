# 任务 4：客户端只读观战与直达当前比赛画面

## 修改范围

- `web/src/net.js`：玩家连接继续使用席位令牌；观战连接使用房间码，观战重连不附加 `since`。观战不写入并会清理玩家 `SEAT_KEY`。重连 greeting 无论 `seq` 是否变化都作为 `sync` 送入流程，后续编号广播仍按 `seq` 去重。对观战连接的发送入口仅放行 ping。
- `web/src/flow.js`：根据 `hello.current.phase` 进入 wait、show、loading、game 或 finish；下注快照恢复倒计时、公开选择和玩家自己的选择；重连同步会覆盖玩家数组、角色、模式和当前阶段。观战不构造玩家席，不显示下注/表情/离场操作，不发送 ready、bet、watched、leave 或 emoji；观战结果与排名使用只读显示。
- `web/src/arena.js`：增加 `seekTo(elapsedMs)`，用确定性模拟静默推进到目标时间，清空视觉事件和过期特效后绘制当前状态。当前战斗跳过开场动画与历史生成效果；服务器结果先到时停止模拟并直接采用服务器胜负。原有 `playbackRate` 自动加速曲线未改动。

## 静态审阅

逐项检查了首次加入 wait/show/loading/bet/battle/result/finish、下注阶段中途加入、战斗中途加入、玩家重连、观战只读边界、服务器结果先于本地模拟完成等路径。模拟 seek 不调用渲染、不播放中间事件；正常新回合仍由原始实时播放路径启动。

## 验证边界

- `git diff --check`：通过。
- 未新增或运行测试，遵照当前开发要求。
- 未推送或合并。

## 后续修复：show/loading 消费重连同步

- 修复 stShow() 与 stLoading() 未消费重连 sync 的路径：入口、展示/等待过程及阶段交接均检查同步快照，并按 current.phase 路由。stLoading() 的消息等待现在也接收 sync；快照生效后关闭当前屏幕及待关闭的 show 屏幕，不把旧同步留给后续阶段。seq 去重与快照权威性保持不变。
- 自审确认只覆盖 web/src/flow.js 此同步路径及本报告；未新增或运行测试。git diff --check：通过。
