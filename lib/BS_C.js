var echo = require('../utils/logger');
var CACHE = require('../utils/cache');
var gameData = require('../utils/gameData');
var kvListToObj = require('../utils/kvListToObj');
/**
 *  -- 服务器
     server  -- 主服务器
     battle_server   -- 对战服务器
 * */
// 代码集
var supportList = {
    // 登录游戏成功
    'rpc_client_brpc_login_return': function() {
        //  rpc_client_brpc_login_return({\"result\":0,\"msg\":\"登录游戏成功\"})
        CACHE.battle.runTimeLeft = Date.now();
    },
    // 战斗流程控制开始
    'rpc_client_brpc_proto': function(content) {
        // rpc_client_brpc_proto(\"{\\\"param\\\":{\\\"round\\\":2,\\\"win\\\":1,\\\"seed\\\":0,\\\"record\\\":[]},\\\"action\\\":\\\"battleOver\\\"}\")
        var json = JSON.parse(content);
        /*CTRL_ACTION = {
            ROUND_READY         = "roundReady",
            ROUND_BEGIN         = "roundBegin",
            BOSS_READY          = "bossReady",
            BOSS_BEGIN          = "bossBegin",
            ROUND_OVER          = "roundOver",
            BATTLE_OVER         = "battleOver",
            CONCEDE             = "concede",
            EMOJI               = "emoji",
        }*/
        var action = json.action;
        var param = json.param;
        /*{
            "round": 2,
            "win": 1,
            "seed": 0,
            "record": []
        }*/
        echo("[战斗流程] action:", action);
    },
    // 客户端战斗帧 - 开始
    'rpc_client_fight_frame_begin': function(frame, gameTime) {
        CACHE.battle.frameBegin = {
            'frame': frame,
            'serverTime': frame * 100,
            'gameTime': gameTime
        };
    },
    // 客户端战斗帧 - 结束
    'rpc_client_fight_frame_end': function() {
        if(CACHE.battle.runTimeLeft === -1 || Date.now() - CACHE.battle.runTimeLeft < CACHE.battle.runTimeInterval) {
            return;
        }
        CACHE.battle.runTimeLeft = Date.now();

        var result = "", i, key, keyList,
            playInfo = CACHE.battle.self,
            ballList = playInfo.ballList;
        if(playInfo.cfg) {
            // 升级球球 Lv
            var upGrade = function() {
                // 升级球球等级 ——> Up Lv.*
                var minGrade = null;
                keyList = Object.keys(playInfo.ballsGrade);
                // 遍历等级最小的、依次升级
                for (i=0; i < keyList.length ; i++) {
                    key = keyList[i];
                    var item = playInfo.ballsGrade[key];
                    // 判断不是满级球球Lv.Max 和 不升级的辅助球球
                    if(item.grade <= 4 && !gameData.BattleConst.notUpgrade.includes(item.dbType)) {
                        if(minGrade) {
                            // 等级低的
                            if(item.grade < minGrade.grade) {
                                minGrade = item; // 取得等级低的 龙珠
                            }
                        } else {
                            // 第一个
                            minGrade = item;
                        }
                    }
                }
                if(minGrade) {
                    var upgradeSp = gameData.BattleConst.DragonBallUpgradeCost[minGrade.grade]; // 根据等级取升级所需 SP
                    if(upgradeSp && CACHE.battle.self.cfg.sp >= upgradeSp) {
                        echo('[升级球球] ' + minGrade.name + ' 消耗SP:', upgradeSp, "类型:", minGrade.dbType);
                        return 'battle_server.rpc_server_fight_ball_upgrade(' + minGrade.dbType + ')'; // 升级球球
                    }
                }
            };
            var mergeBall = function() {
                var evalStr = "";
                for (i=0; i < keyList.length ; i++) { // 循环所有球球，寻找可合并的
                    key = keyList[i];
                    var ballItem = ballList[key];
                    if(ballItem.ballType === 32) { // 成长球球不合并
                        continue;
                    }
                    for (var j=i+1; j < keyList.length ;j++) {
                        key = keyList[j];
                        var compareBall = ballList[key];
                        if(ballItem.ballType === compareBall.ballType && ballItem.star === compareBall.star) {
                            evalStr += 'battle_server.rpc_server_fight_ball_merge(' + ballItem.ballId + ',' + compareBall.ballId + ');';
                            echo('[球球合并] 合并：' + ballItem.ballId + ',' + compareBall.ballId);
                            evalStr += 'battle_server.rpc_server_fight_ball_create()'; // 创建球球
                            return evalStr;
                        }
                    }
                }
            };
            // SP 大于创造球球
            if(playInfo.cfg.sp >= playInfo.cfg.cost) {
                // keyList = Object.keys(ballList);
                keyList = CACHE.getBallKeysSort(); // 排序
                // 总球数少于 15 个可以创建球球
                if(keyList.length < playInfo.ballMaxNum) {
                    return 'battle_server.rpc_server_fight_ball_create()'; // 创建球球
                } else {
                    // 球球满了
                    result = mergeBall();
                    if(!result) {
                        return upGrade();
                    }
                }
            } else {
                return upGrade();
            }
        }
    },
    // 游戏结束
    'rpc_client_fight_end': function() {
        // rpc_client_fight_end()
        // TODO 这里可以下一局操作
        CACHE.battle.runTimeLeft = -1;
        CACHE.battle.battleType = 0;
        // 回到大厅界面
        return 'local BattlePvpResultPopLayer = require("ui.battle_scene.battle_pvp_result_pop_layer");BattlePvpResultPopLayer:onOKClick();';
    },
    // 在轮次开始之间播放boss预告
    'rpc_client_fight_boss_trailer': function (bossType) {
        /*BattleConst.BossType = {
            Knight = 101,	-- 骑士（转王）
            Magician = 102,	-- 魔术师
            Imprison = 103,	-- 禁锢
            Summoner = 104,	-- 召唤师
            Assassinator = 105,	-- 暗杀大师
        }*/
    },
    // 轮次开始
    'rpc_client_fight_round_begin': function (time, round) {
        // rpc_client_fight_round_begin(120,1)
        // time = BOSS 来临倒计时？
        CACHE.battle.round = round; // 战斗第几回合
    },
    // 轮次结束
    'rpc_client_fight_round_end': function () {

    },
    /**
     * 战斗球攻击
     * @param ballId
     * @param attackInfo
     *  {
            "targetIds": [33],      攻击目标
            "bulletSpeed": 2000,    子弹速度
            "defaultDamage": 20,    攻击伤害
            "interval": 500         攻击间隔
        }
     */
    'rpc_client_fight_ball_attack': function(ballId, attackInfo) {
        // rpc_client_fight_ball_attack(25,{\"targetIds\":[33],\"bulletSpeed\":2000,\"defaultDamage\":20,\"interval\":500})"]
    },
    /**
     * 怪物受到伤害
     * @param hurtList
     * [{
            "damageList": [{
                "damageType": 0,    // 0:子弹 1:火 2:电 3:毒
                "isCrit": 0,
                "attackStar": 0,
                "damage": [0, 20],
                "extraList": [],
                "attackerId": 45
            }],
            "isFatal": 0,
            "monsterId": 33
        }]
     */
    'rpc_client_fight_monster_hurt': function(hurtList) {
        // rpc_client_fight_monster_hurt([{\"damageList\":[{\"damageType\":0,\"isCrit\":0,\"attackStar\":0,\"damage\":[0,20],\"extraList\":[],\"attackerId\":30},{\"damageType\":0,\"isCrit\":0,\"attackStar\":0,\"damage\":[0,20],\"extraList\":[],\"attackerId\":30}],\"isFatal\":0,\"monsterId\":33}])

    },
    // 同步怪物信息
    'rpc_client_fight_monster_sync_info': function (monsterId, monsterInfo) {
        // hp - 血
        // distance - 距离
        // moveSpeed - 移动速度
        // rpc_client_fight_monster_sync_info(69,{\"infoList\":[{\"k\":\"distance\",\"v\":0}]})
        monsterInfo.infoList = kvListToObj(monsterInfo.infoList);
    },
    /**
     * hp
     * @param side - 敌方、我方
     * @param hp
     */
    'rpc_client_fight_player_hp': function (side, hp) {
        if(CACHE.battle.selfIndex === side) {
            // 更新数据
            if(CACHE.battle.self) {
                CACHE.battle.self.cfg.hp = hp;
            }
        }
    },
    /**
     * sp
     * @param side
     * @param curSp
     * @param nextBallSp
     */
    'rpc_client_fight_player_sp': function (side, curSp, nextBallSp) {
        // 确认玩家
        if(CACHE.battle.selfIndex === side) { // 玩家自己
            // 更新数据
            if(CACHE.battle.self) {
                CACHE.battle.self.cfg.sp = curSp;
                CACHE.battle.self.cfg.cost = nextBallSp;
            }
            // 经费足够升级
            // if (curSp >= nextBallSp) {
                // rpc_client_fight_frame_end 方法中实现
                // return 'battle_server.rpc_server_fight_ball_create()'; // 创建球球
            // }
        }
    },
    // 创建怪物
    'rpc_client_fight_monster_create': function(monsterId, monsterType, monsterBaseInfo) {
        // rpc_client_fight_monster_create(48,1,{\"infoEx\":[],\"moveSpeed\":100,\"hp\":[0,300],\"side\":2,\"distance\":0})"]
        if(CACHE.battle.selfIndex === monsterBaseInfo.side) {
            var monster = gameData.BattleConst.monster[monsterType];
            // 只输出 BOSS 信息，boss ID 区间 101 ~ 105
            if(monsterType >= 101 && monsterType <= 105) {
                echo('BOSS', monster.name, '登场，ID:', monsterId,'描述：', monster.desc);
            }
        }
    },
    // 销毁怪物
    'rpc_client_fight_monster_destroy': function(monsterId) {

    },
    // 怪物状态 - 添加
    'rpc_client_fight_monster_status_add': function (monsterId, statusInfo) {
        // type 类型 参考 gameData.BattleConst.StatusType
        // rpc_client_fight_monster_status_add(22,{"casterId":20,"lv":1,"extraInfo":[],"id":24,"type":"imprison"})
    },
    // 怪物状态 - 升级
    'rpc_client_fight_monster_status_update': function (monsterId, statusInfo) {
        // rpc_client_fight_monster_status_update(82,{"casterId":20,"lv":1,"extraInfo":[],"id":89})
    },
    // 怪物状态 - 删除
    'rpc_client_fight_monster_status_remove': function (monsterId, statusInfo) {

    },
    // 创建球球
    'rpc_client_fight_ball_create': function (ballId, ballType, ballInfo) {
        // rpc_client_fight_ball_create(13,38,{"pos":14,"side":1,"star":1})
        // rpc_client_fight_ball_create(1237,21,{\"pos\":8,\"side\":1,\"star\":2})
        // 确认玩家
        if(ballInfo.side ===  CACHE.battle.selfIndex) {
            // 玩家自己
            var pos = ballInfo.pos; // 服务器是0，js 也是0
            var ballData = {
                ballId: ballId, // 球球实例ID
                ballType: ballType, // 球球ID
                ballName: CACHE.getBallName(ballType), // 球球名字
                pos: pos, // 棋盘坐标
                star: ballInfo.star // 球球星级
            };
            CACHE.battle.self.ballList[ballId] = ballData;
            // TODO 调试语句
            // console.log('[我方] 创造球球：', ballData.ballName, 'ID:', ballData.ballId, 'STAR:', ballData.star);
        }
    },
    // 销毁球球
    'rpc_client_fight_ball_destroy': function(ballId) {
        var ballItem = CACHE.battle.self.ballList[ballId];
        if(ballItem) { // 存在 球球的，对比ID
            // console.log('[我方]', '删除球球:', ballItem.ballName, 'ID:', ballItem.ballId, 'STAR:', ballItem.star);
            delete CACHE.battle.self.ballList[ballId];
        }
    },
    // 球球状态 - 添加
    'rpc_client_fight_ball_status_add': function(ballId, statusInfo) {
        // type 类型 参考 gameData.BattleConst.StatusType
        // "ball_kill",		-- 暗杀龙珠目标
        // "boss_kill",		-- boss摧毁目标
        // rpc_client_fight_ball_status_add(182,{\"casterId\":103,\"lv\":1,\"extraInfo\":[{\"k\":\"fromPos\",\"v\":13}],\"id\":206,\"type\":\"ball_kill\"})
        // rpc_client_fight_ball_status_add(2456,{\"casterId\":2467,\"lv\":1,\"extraInfo\":[{\"k\":\"fromPos\",\"v\":11}],\"id\":2470,\"type\":\"ball_kill\"})
        // TODO 根据球球列表、球球星星 遍历，在暗杀前进行合并
        /*{
            "casterId": 77,
            "lv": 1,
            "extraInfo": [{
                "k": "fromPos",
                "v": 8
            }],
            "id": 113,
            "type": "ball_kill"
        }*/
        var result = "";
        var playInfo = CACHE.battle.self;
        var ballList = playInfo.ballList;
        var ballItem = ballList[ballId];
        // 确认玩家 - 如果在我方棋盘找到 该球球ID 就说明 技能目标是我方球球
        if(ballItem) {
            // 判断 球球技能 暗杀 且 非合作模式
            if(statusInfo.type === 'ball_kill' && CACHE.battle.battleType != 2) {
                // rpc_server_fight_ball_merge(from, to) 合并
                var mergeBall = CACHE.getBallMergeId(ballItem.ballId);
                if(mergeBall) {
                    result += 'battle_server.rpc_server_fight_ball_merge(' + ballId + ',' + mergeBall.ballId + ');';
                    echo('[球球合并] 暗杀球球抢救，合并：' + ballId + ',' + mergeBall.ballId);
                }
            }
        }
        return result;
    },
    // 球球状态 - 升级
    'rpc_client_fight_ball_status_update': function (ballId, statusInfo) {

    },
    // 球球状态 - 删除
    'rpc_client_fight_ball_status_remove': function (ballId, statusId) {
        // rpc_client_fight_ball_status_remove(30,152)
    },
    // 战斗球 Lv 升级
    'rpc_client_fight_ball_upgrade': function(side, ballType, ballGrade) {
        // rpc_client_fight_ball_upgrade(2,24,3)
        // 判断玩家 - 自己
        if(side === CACHE.battle.selfIndex) {
            CACHE.battle.self.ballsGrade[ballType].grade = ballGrade;
        }
    },
    // 路线道具 - 添加
    'rpc_client_fight_creature_add': function(creatureId, creatureInfo) {

    },
    // 路线道具 - 删除
    'rpc_client_fight_creature_remove': function(creatureId) {

    },
    // 发送表情包
    'rpc_client_fight_emoji': function(side, emojiId) {
        if(side !== CACHE.battle.selfIndex) {
            return 'battle_server.rpc_server_fight_emoji(' + emojiId + ');';
        }
    },
    // 暂停
    'rpc_client_fight_pause': function () {},
    // 继续
    'rpc_client_fight_resume': function () {},
    // 战斗怪物刷新
    'rpc_client_fight_monster_refresh': function(monsterList) {
        // rpc_client_fight_monster_refresh([{\"distance\":20,\"id\":654},{\"distance\":20,\"id\":653}])
    },
    // 提示信息1
    'rpc_client_tell_me': function(color, str) {
        // rpc_client_tell_me(6,\"[\\\"更新成功\\\"]\")
    },
};
// 战斗：服务器 -> 客户端
function BS_C(handleStr) {
    var result, evalStr;
    if(new RegExp(Object.keys(supportList).join("|")).test(handleStr)) {
        // echo.log('[记录日志] [BS_C] ' + handleStr);
        // 处理方法
        try{
            evalStr = "supportList." + handleStr;
            //echo("[Eval]", evalStr);
            result = eval(evalStr);
            if(result) {
                // echo('[BS->C 处理代码]', handleStr, "\n[处理结果]", result);
            } else {
                result = "DEBUG = 4"; // 空代码执行
                // echo('[无法处理代码]', handleStr);
            }
        }catch (e) {
            echo('[不支持的执行代码]', handleStr, e.message);
        }
    } else {
        // 未处理
    }
    return result;
}

module.exports = BS_C;