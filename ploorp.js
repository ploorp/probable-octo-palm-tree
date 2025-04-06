import { client } from './src/client.js';
import config from './config.json' with { type: 'json' };
import axios from 'axios';

client.on('PRIVMSG', async (msg) => {
  /*
  if (!config.whitelist_channels.includes(msg.senderUsername.toLowerCase())) {
    return;
  }
  */

  if (msg.messageText.startsWith('!ping')) {
    return client.say(msg.channelName, 'pong');
  }

  if (msg.messageText.includes('pl 00 rp')) {
    return client.say(msg.channelName, '00');
  }

  if (msg.messageText.includes('ploorp') || msg.messageText.contains('plorp')) {
    return client.say(msg.channelName, msg.senderUsername);
  }

  if (msg.messageText.startsWith('!boxd')) {
    const args = msg.messageText.slice(5).trim().split(' ');

    let username;
    let rssUrl;
    let response;

    // if no arguments try to use the sender's username
    if (!args[0].length) {
      rssUrl = `https://letterboxd.com/${msg.senderUsername}/rss/`;
      try {
        response = await axios.get(rssUrl);
      } catch (error) {
        return client.say(
          msg.channelName,
          'format is !boxd <username>'
        );
      }
      username = msg.senderUsername;
    } else {
      username = args[0].toLowerCase();
      rssUrl = `https://letterboxd.com/${username}/rss/`;
      try {
        response = await axios.get(rssUrl);
      } catch (error) {
        return client.say(
          msg.channelName,
          'bad username'
        );
      }
    }

    const xmlData = response.data;
    const linkMatch = xmlData.match(/<item>.*?<link>(.*?)<\/link>/s);

    if (!linkMatch || !linkMatch[1].includes('/film/')) {
      return client.say(
        msg.channelName,
        `${username} has not logged any movies`
      );
    }

    const jsonUrl = linkMatch[1] + '/json';
    let jsonResponse;

    try {
      jsonResponse = await axios.get(jsonUrl);
    } catch (error) {
      return client.say(
        msg.channelName,
        'error Reacting'
      );
    }

    const jsonData = jsonResponse.data;

    const movieTitle = jsonData.viewingable.name;
    const reviewUrl = `https://letterboxd.com/${username}/film/${jsonData.viewingable.slug}`;
    const movieUrl = `https://letterboxd.com/film/${jsonData.viewingable.slug}`;
    const profileUrl = `https://letterboxd.com/${username}/`;
    const dateLogged = jsonData.viewingDate;
    // const dateLogged = jsonData.viewingDateStr;
    const rating = jsonData.rating;
    const rewatch = jsonData.rewatch ? 'rewatched' : 'watched';
    const releaseDate = jsonData.viewingable.releaseYear;
    const like = jsonData.liked;

    let review = jsonData.reviewText;
    if (review && review.length > 150) {
      review = review.slice(0, 150) + '...';
    }

    const ratingText = `${rating || like ? 'rating:' + (rating ? ' ' + rating/2 + '/5' : '') + (like ? ' ❤️' : '') : ''}`;
    const reviewText = `${review ? 'review: ' + review : ''}`;

    const message = `${dateLogged} ${username} ${rewatch} ${movieTitle} (${releaseDate}) ${ratingText} ${reviewUrl}`;

    return client.say(
      msg.channelName,
      message
    );
  }
});
