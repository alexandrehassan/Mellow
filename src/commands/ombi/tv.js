const Discord = require('discord.js');
const commando = require('discord.js-commando');
const {deleteCommandMessages, get, post} = require('../../util.js');

function outputTVShow(msg, show) {
	let tvEmbed = new Discord.MessageEmbed()
	.setTitle(`${show.title} ${(show.firstAired) ? `(${show.firstAired.substring(0,4)})` : ''}`)
	.setDescription(show.overview.substr(0, 255) + '(...)')
	.setFooter(msg.author.username, `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`)
	.setTimestamp(new Date())
	.setImage(show.banner)
	.setURL(`https://www.thetvdb.com/?id=${show.id}&tab=series`)
	.setThumbnail('https://i.imgur.com/9dcDIYe.png')
	.addField('__Network__', show.network, true)
	.addField('__Status__', show.status, true);

	if (show.available) tvEmbed.addField('__Available__', '✅', true);
	if (show.quality) tvEmbed.addField('__Quality__', show.quality, true);
	if (show.requested) tvEmbed.addField('__Requested__', '✅', true);
	if (show.approved) tvEmbed.addField('__Approved__', '✅', true);
	if (show.plexUrl) tvEmbed.addField('__Plex__', `[Watch now](${show.plexUrl})`, true);
	if (show.embyUrl) tvEmbed.addField('__Emby__', `[Watch now](${show.embyUrl})`, true);

	return msg.embed(tvEmbed);
}

function getTVDBID(ombi, msg, name) {
	return new Promise((resolve, reject) => {
		get({
			headers: {'accept' : 'application/json',
			'Authorization': `Bearer ${ombi.accessToken}`,
			'User-Agent': `Mellow/${process.env.npm_package_version}`},
			url: 'https://' + ombi.host + ((ombi.port) ? ':' + ombi.port : '') + '/api/v1/Search/tv/' + name
		}).then(({response, body}) => {
			let data = JSON.parse(body)

			if (data.length > 1) {
				let fieldContent = '';
				data.forEach((show, i) => {
					fieldContent += `${i+1}) ${show.title} `
					if (show.firstAired) fieldContent += `(${show.firstAired.substring(0,4)}) `
					fieldContent += `[[TheTVDb](https://www.thetvdb.com/?id=${show.id}&tab=series)]\n`
				})
			
				let showEmbed = new Discord.MessageEmbed()
				showEmbed.setTitle('Ombi TV Show Search')
				.setDescription('Please select one of the search results. To abort answer **cancel**')
				.addField('__Search Results__', fieldContent);
				msg.embed(showEmbed);
		
				msg.channel.awaitMessages(m => (!isNaN(parseInt(m.content)) || m.content.startsWith('cancel')) && m.author.id == msg.author.id, { max: 1, time: 120000, errors: ['time'] })
				.then((collected) => {
					let message = collected.first().content
					let selection = parseInt(message)
		
					if (message.startsWith('cancel')) {
						msg.reply('Cancelled command.');
					} else if (selection >= 1 && selection <= data.length) {
						return resolve(data[selection - 1].id)
					} else {
						msg.reply('Please enter a valid selection!')
					}
					return resolve()
				})
				.catch((collected) => {
					msg.reply('Cancelled command.');
					return resolve()
				});
			} else if (!data.length) {
				msg.reply('Couldn\'t find the tv show you were looking for. Is the name correct?');
				return resolve()
			} else {
				return resolve(data[0].id)
			}
		})
		.catch((error) => reject(error))
	})
}

function requestTVShow(ombi, msg, showMsg, show) {
	if ((!ombi.requesttv || msg.member.roles.some(role => role.name === ombi.requesttv)) && (!show.available && !show.requested && !show.approved)) {
		msg.reply('If you want to request this tv show please click on the ⬇ reaction.');
		showMsg.react('⬇');
		
		showMsg.awaitReactions((reaction, user) => reaction.emoji.name === '⬇' && user.id === msg.author.id, { max: 1, time: 120000 })
		.then(collected => {
			if (collected.first()) {
				post({
					headers: {'accept' : 'application/json',
					'Content-Type' : 'application/json',
					'Authorization': `Bearer ${ombi.accessToken}`,
					'ApiAlias' : `${msg.author.username} (${msg.author.id})`,
					'UserName' : (ombi.username !== "") ? ombi.username : '',
					'User-Agent': `Mellow/${process.env.npm_package_version}`},
					url: 'https://' + ombi.host + ((ombi.port) ? ':' + ombi.port : '') + '/api/v1/Request/tv/',
					body: JSON.stringify({ "tvDbId": show.id, "requestAll" : true })
				}).then((resolve) => {
					return msg.reply(`Requested ${show.title} in Ombi.`);
				}).catch((error) => {
					console.error(error);
					return msg.reply('There was an error in your request.');
				});
			}
		}).catch(collected => {
			return showMsg;
		});
	}
	return showMsg;
}

module.exports = class searchTVCommand extends commando.Command {
	constructor (client) {
		super(client, {
			'name': 'tv',
			'memberName': 'tv',
			'group': 'ombi',
			'description': 'Search and Request TV Shows in Ombi',
			'examples': ['tv The Big Bang Theory', 'tv tvdb:80379'],
			'guildOnly': true,

			'args': [
				{
					'key': 'name',
					'prompt': 'Name of the TV Show',
					'type': 'string'
				}
			]
		});
	}

	async run (msg, args) {
		if (!args.name) {
			return msg.reply('Please enter a valid TV show name!');
		}

		let ombi = await this.client.webDB.loadSettings('ombi')
		ombi.accessToken = this.client.accessTokens[ombi.username]

		let tvdbid = null
		if (!args.name.startsWith("tvdb:")) {
			tvdbid = await getTVDBID(ombi, msg, args.name)
			.catch((error) => {
				console.error(error);
				return msg.reply('There was an error in your request.');
			});
		} else {
			console.log(JSON.stringify(args.name))
			let matches = /^tvdb:(\d+)$/.exec(args.name)
			if (!matches) {
				return msg.reply('Please enter a valid TVDB ID!');
			}
			tvdbid = matches[1]
		}

		if (tvdbid) {
			get({
				headers: {'accept' : 'application/json',
				'Authorization': `Bearer ${ombi.accessToken}`,
				'User-Agent': `Mellow/${process.env.npm_package_version}`},
				url: 'https://' + ombi.host + ((ombi.port) ? ':' + ombi.port : '') + '/api/v1/Search/tv/info/' + tvdbid
			})
			.then(({response, body}) => {
				let data = JSON.parse(body)

				outputTVShow(msg, data).then(dataMsg => {
					deleteCommandMessages(msg, this.client);
					requestTVShow(ombi, msg, dataMsg, data);
				}).catch((error) => {
					return msg.reply('Cancelled command.');
				});
			})
			.catch((error) => {
				console.error(error);
				return msg.reply('There was an error in your request.');
			})
		}
	}
};