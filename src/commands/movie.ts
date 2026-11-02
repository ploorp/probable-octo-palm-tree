import { saySafe } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getPrefix } from '../db/dbManager.js';
import { formatRatings, searchFilm } from '../api/letterboxd.js';

export default async function movie(msg: PrivmsgMessage, args: string[]) {
  const prefix = getPrefix(msg.channelID)

  const query = args.slice(1).join(' ').trim();

  if (!query) {
    return saySafe(msg.channelName, `usage: ${prefix}movie <movie title>`, msg.messageID);
  }

  const data = await searchFilm(query);
  if (!data) {
    return saySafe(msg.channelName, `no movie found tupid`, msg.messageID);
  }

  const ratingText = data.average ? `${data.average.toFixed(2)}/5 avg` : 'no rating';
  const ratingsText = data.ratings ? `${formatRatings(data.ratings)} ratings` : '0 ratings';
  const directorText = data.director || 'unknown director';
  const yearText = data.year || 'n.d.';

  const message = `${data.title} (${yearText}) by ${directorText} - ${ratingText} from ${ratingsText} https://letterboxd.com/film/${data.slug}/`;

  return saySafe(msg.channelName, `${message}`, msg.messageID);
}
