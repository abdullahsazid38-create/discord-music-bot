const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require("discord.js");

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus
} = require("@discordjs/voice");

const play = require("play-dl");
const express = require("express");

const TOKEN = process.env.TOKEN;
const PREFIX = process.env.PREFIX || "!";
const PORT = process.env.PORT || 3000;

// Keep alive server (Railway/VPS friendly)
const app = express();
app.get("/", (req, res) => res.send("Bot is running 🚀"));
app.listen(PORT, () => console.log("Web server running"));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

const queues = new Map();

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// ================= COMMAND HANDLER =================
client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // PLAY
    if (cmd === "play") {
        const query = args.join(" ");
        if (!query) return message.reply("❌ Provide song name or link");

        const voice = message.member.voice.channel;
        if (!voice) return message.reply("❌ Join voice channel first");

        let queue = queues.get(message.guild.id);

        let info;
        if (play.yt_validate(query) === "video") {
            info = await play.video_info(query);
            info = info.video_details;
        } else {
            const search = await play.search(query, { limit: 1 });
            if (!search.length) return message.reply("No results found");
            info = search[0];
        }

        const song = {
            title: info.title,
            url: info.url,
            thumbnail: info.thumbnails?.[0]?.url
        };

        if (!queue) {
            const newQueue = {
                voice,
                connection: null,
                player: createAudioPlayer(),
                songs: []
            };

            queues.set(message.guild.id, newQueue);
            newQueue.songs.push(song);

            const connection = joinVoiceChannel({
                channelId: voice.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator
            });

            newQueue.connection = connection;
            playSong(message.guild.id);
        } else {
            queue.songs.push(song);
            message.reply(`➕ Added **${song.title}**`);
        }
    }

    // SKIP
    if (cmd === "skip") {
        const queue = queues.get(message.guild.id);
        if (!queue) return message.reply("Nothing playing");
        queue.player.stop();
        message.reply("⏭️ Skipped");
    }

    // STOP
    if (cmd === "stop") {
        const queue = queues.get(message.guild.id);
        if (!queue) return message.reply("Nothing playing");

        queue.songs = [];
        queue.connection.destroy();
        queues.delete(message.guild.id);

        message.reply("🛑 Stopped");
    }
});

// ================= PLAY FUNCTION =================
async function playSong(guildId) {
    const queue = queues.get(guildId);
    if (!queue) return;

    const song = queue.songs[0];
    if (!song) return;

    const stream = await play.stream(song.url);

    const resource = createAudioResource(stream.stream, {
        inputType: stream.type
    });

    queue.player.play(resource);
    queue.connection.subscribe(queue.player);

    queue.player.once(AudioPlayerStatus.Idle, () => {
        queue.songs.shift();
        playSong(guildId);
    });

    queue.textChannel?.send?.(`🎵 Now Playing: **${song.title}**`);
}

client.login(TOKEN);
