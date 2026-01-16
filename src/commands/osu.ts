import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
import { getAccount } from '../db/dbManager.js';
import { getUser, getRecentPlays, getBestPlays, getBeatmap } from '../api/osu.js';
import { getFlagEmoji } from '../utils.js';

export default async function osu(msg: PrivmsgMessage, args: string[]) {
    const subcommand = args[1] ? args[1].toLowerCase() : '';
    
    let targetUser = '';
    let mode = 'profile'; // profile, recent, top

    if (subcommand === 'recent' || subcommand === 'rs') {
        mode = 'recent';
        targetUser = args[2] || '';
    } else if (subcommand === 'top' || subcommand === 'best') {
        mode = 'top';
        targetUser = args[2] || '';
    } else {
        if (args[1] && args[1] !== 'recent' && args[1] !== 'rs' && args[1] !== 'top' && args[1] !== 'best') {
            targetUser = args[1];
        }
    }

    if (!targetUser) {
        const linkedId = getAccount(msg.senderUserID, 'osu');
        if (linkedId) {
            targetUser = linkedId;
        } else {
            return saySafe(msg.channelName, `@${msg.senderUsername}, usage: %osu <username> or link your account`, msg.messageID);
        }
    }

    const user = await getUser(targetUser);
    if (!user) {
        return saySafe(msg.channelName, `@${msg.senderUsername}, user not found`, msg.messageID);
    }

    if (mode === 'profile') {
        const globalRank = user.statistics.global_rank ? `🌐#${user.statistics.global_rank}` : 'Unranked';
        const countryRank = user.statistics.country_rank ? `${getFlagEmoji(user.country_code)}#${user.statistics.country_rank}` : '';
        const pp = Math.round(user.statistics.pp);
        const acc = user.statistics.hit_accuracy.toFixed(2);
        const playtime = Math.round(user.statistics.play_time / 3600);
        
        const best = await getBestPlays(user.id);
        let topPlayStr = '';
        if (best && best.length > 0) {
            const top = best[0];
            topPlayStr = ` | Top play: ${Math.round(top.pp)}pp ${top.beatmapset.title} [${top.beatmap.version}]`;
        }

        return saySafe(msg.channelName, `@${msg.senderUsername} ${user.username} ${globalRank} ${countryRank} | ${pp}pp ${acc}% | Playtime: ${playtime}h | https://osu.ppy.sh/users/${user.id}${topPlayStr}`, msg.messageID);
    }

    if (mode === 'recent') {
        const recents = await getRecentPlays(user.id);
        if (!recents || recents.length === 0) {
            return saySafe(msg.channelName, `@${msg.senderUsername}, no recent plays found for ${user.username}`, msg.messageID);
        }
        const play = recents[0];
        let map = play.beatmap;
        const set = play.beatmapset;

        if (!map.max_combo) {
            const fullMap = await getBeatmap(map.id);
            if (fullMap) map = fullMap;
        }
        
        const rank = play.rank;
        const pp = play.pp ? `${Math.round(play.pp)}PP` : '0PP';
        const acc = (play.accuracy * 100).toFixed(2);
        const score = play.score;
        const combo = `x${play.max_combo}/${map.max_combo || '?'}`;
        const hits = `[${play.statistics.count_300}/${play.statistics.count_100}/${play.statistics.count_50}/${play.statistics.count_miss}]`;
        const mods = play.mods.length > 0 ? ` +${play.mods.join('')}` : '';
        const stars = map.difficulty_rating.toFixed(2);

        return saySafe(msg.channelName, `${set.title} [${map.version}]${mods} [${stars}⭐] ● ${rank} ${pp} ● ${acc}% ● ${score} ● ${combo} ● ${hits} ● https://osu.ppy.sh/scores/${play.id}`, msg.messageID);
    }

    if (mode === 'top') {
        const best = await getBestPlays(user.id);
        if (!best || best.length === 0) {
            return saySafe(msg.channelName, `@${msg.senderUsername}, no top plays found for ${user.username}`, msg.messageID);
        }
        const play = best[0];
        let map = play.beatmap;
        const set = play.beatmapset;

        if (!map.max_combo) {
            const fullMap = await getBeatmap(map.id);
            if (fullMap) map = fullMap;
        }
        
        const rank = play.rank;
        const pp = `${Math.round(play.pp)}PP`;
        const acc = (play.accuracy * 100).toFixed(2);
        const score = play.score;
        const combo = `x${play.max_combo}/${map.max_combo || '?'}`;
        const hits = `[${play.statistics.count_300}/${play.statistics.count_100}/${play.statistics.count_50}/${play.statistics.count_miss}]`;
        const mods = play.mods.length > 0 ? ` +${play.mods.join('')}` : '';
        const stars = map.difficulty_rating.toFixed(2);

        return saySafe(msg.channelName, `${set.title} [${map.version}]${mods} [${stars}⭐] ● ${rank} ${pp} ● ${acc}% ● ${score} ● ${combo} ● ${hits} ● https://osu.ppy.sh/scores/${play.id}`, msg.messageID);
    }
}