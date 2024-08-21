/**
 * @author Baxtian
 * @version 1.0.0
 * @license CC-BY-NC-SA-4.0
 */

const { Podcast } = require("podcast");
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const koa = require('koa');
const serve = require('koa-static');
const range = require('koa-range');

const domainName = 'YOUR_DOMAIN'
const url = 'https://' + domainName;
const staticPodcastPath = path.join(__dirname, 'YOUR_PODCAST_FOLDER');
const podJsonPath = '/podcast.json';
const podImgPath = '/podcast.jpg';

/*const config = {
    domain: domainName,
    https: {
        port: 443, // any port that is open and not already used on your server
        options: {
          key: fs.readFileSync(path.resolve(process.cwd(), '/etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem'), 'utf8').toString(),
          cert: fs.readFileSync(path.resolve(process.cwd(), '/etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem'), 'utf8').toString(),
        },
    },
};*/

let episodesMap = new Map(); // To keep track of added episodes

/**
 * @brief Reads a JSON file and parses its content.
 * @param filePath The path to the JSON file.
 * @return Parsed JSON object, or null if an error occurs.
 */
function readJSONFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading JSON file ${filePath}:`, error);
    return null;
  }
}

/**
 * @brief Sorts episodes by date in descending order (most recent first).
 */
function sortEpisodesByDate() {
  // Convert the Map to an array and sort it by the date of the episodes
  const sortedEpisodes = [...episodesMap.entries()].sort(([, a], [, b]) => new Date(b.date) - new Date(a.date));
  // Rebuild the feed with sorted episodes
  feed.items = sortedEpisodes.map(([, episode]) => episode);
}

/**
 * @brief Adds an episode to the RSS feed.
 * @param jsonFile The JSON metadata file for the episode.
 * @param audioFile The audio file associated with the episode.
 * @param imageFile The image file for the episode (or default podcast image).
 * @param folderName The name of the folder containing the episode files.
 */
function addEpisod(jsonFile, audioFile, imageFile, folderName) {
  const episode = {
    title: jsonFile.title,
    description: jsonFile.description,
    //url: url + '/' + audioFile, // link to the item
    date: jsonFile.date, // any format that js Date can parse.
    enclosure: {
      url: url + '/' + audioFile,
      file: staticPodcastPath + '/' + audioFile,
      type: 'audio/x-m4a'
    },
    itunesExplicit: false,
    itunesDuration: jsonFile.duration,
    itunesImage: url + imageFile
  };

  episodesMap.set(folderName, episode);// Store the episode with the folder name
  sortEpisodesByDate(); // Sort episodes by date after adding
}

/**
 * @brief Removes an episode from the RSS feed.
 * @param folderName The name of the folder containing the episode files.
 */
function removeEpisode(folderName) {
  if (episodesMap.delete(folderName)) {
      sortEpisodesByDate(); // Re-sort episodes after removal
      console.log(`Episode removed: ${folderName}`);
  }
}

/**
 * @brief Checks if a folder contains the necessary files for an episode.
 * @param folderPath The folder where to check the contents.
 * @return Promise resolving to an object with file names if valid, or false if not.
 */
async function checkFolderContent(folderPath) {
  return new Promise((resolve, reject) => {
    fs.readdir(folderPath, (err, files) => {
      if (err) {
        reject(err);
      } else {
        const m4aFile = files.find(file => file.endsWith('.m4a'));
        const jsonFile = files.find(file => file.endsWith('.json'));
        if (m4aFile && jsonFile) {
          resolve({ m4aFile, jsonFile });
        } else {
          resolve(false);
        }
      }
    });
  });
}

/**
 * @brief Processes a folder to add the episode if valid.
 * @param folderName The name of the folder containing the episode files.
 * @param folderPath The full path to the folder.
 */
async function processEpisodeFolder(folderName, folderPath) {
  const isContentValid = await checkFolderContent(folderPath);
  if (isContentValid) {
      const { m4aFile, jsonFile } = isContentValid;
      const episodeJson = readJSONFile(path.join(folderPath, jsonFile));
      const episodeImagePath = path.join(folderPath, 'episode.jpg');
      let imageUrl;
      if (fs.existsSync(episodeImagePath)) {
          imageUrl = '/' + folderName + '/episode.jpg';
      } else {
          imageUrl = podImgPath;
      }
      addEpisod(episodeJson, folderName + '/' + m4aFile, imageUrl, folderName);
      console.log(`Episode added: ${folderName}`);
  } else {
      console.log(`Necessary files are not all present in folder ${folderName}`);
  }
}

/**
 * @brief Adds all existing episodes in the podcast directory to the RSS feed on startup.
 */
function addExistingEpisodes() {
  fs.readdir(staticPodcastPath, (err, folders) => {
      if (err) {
          console.error('Error reading podcast directory:', err);
          return;
      }
      folders.forEach(async (folder) => {
          const folderPath = path.join(staticPodcastPath, folder);
          fs.stat(folderPath, async (err, stats) => {
              if (err) {
                  console.error(`Error checking folder ${folder}`, err);
                  return;
              }
              if (stats.isDirectory()) {
                  await processEpisodeFolder(folder, folderPath);
              }
          });
      });
  });
}

// Call the function at startup to add existing episodes
addExistingEpisodes();

/**
 * @brief Watches the podcast folder for new or deleted folders and updates the RSS feed accordingly.
 */
fs.watch(staticPodcastPath, { recursive: false }, async (eventType, filename) => {
  const fullPath = path.join(staticPodcastPath, filename);

  if (eventType === 'rename') {
    // Check if the modified item is a folder
    fs.stat(fullPath, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          removeEpisode(filename);
          return;
        } else {
          console.error(`Error checking element type ${filename}`, err);
          return;
        }
      }

      if (stats.isDirectory()) {
        console.log(`New folder detected : ${filename}`);
        const folderPath = path.join(staticPodcastPath, filename);

        // Check periodically every second for up to 30 seconds
        const interval = setInterval(async () => {
          await processEpisodeFolder(filename, fullPath);
          clearInterval(interval); // Stop periodic verification
        }, 1000); // Check every second

        // Stop verification after 30 seconds
        setTimeout(() => {
          clearInterval(interval);
        }, 30000); // 30 seconds
      }
    });
  } else if (eventType === 'unlink') {
    // When an item is deleted from the podcast folder
    console.log(`Item deleted : ${filename}`);
    removeEpisode(filename);
  }
});

const podcastData = readJSONFile(staticPodcastPath + podJsonPath);

const feed = new Podcast({
  title: podcastData.title,
  description: podcastData.description,
  feedUrl: url + '/feed',
  siteUrl: url,
  author: podcastData.author,
  managingEditor: podcastData.managingEditor,
  webMaster: podcastData.webMaster,
  copyright: podcastData.copyright,
  language: podcastData.language,
  categories: [podcastData.category, podcastData.subCategory],
  pubDate: podcastData.date,
  ttl: 60,
  itunesAuthor: podcastData.author,
  itunesOwner: { name: podcastData.author, email: podcastData.email },
  itunesExplicit: false,
  itunesCategory: [{
    text: podcastData.category,
    subcats: [{
      text: podcastData.subCategory
    }]
  }],
  itunesImage: url + podImgPath
});

const server = new koa();

// Add HTTP Range request
server.use(range);

// Add the content of podcast folder available to the webserver
server.use(serve(staticPodcastPath));

// If someone wants the RSS
server.use(async (ctx, next) => {
  if (ctx.path === '/feed') {
    try {
      //console.log(feedXml);
      ctx.type = 'application/xml';
      ctx.body = feed.buildXml();
    } catch (error) {
      ctx.status = 500;
      ctx.body = 'Server internal error';
    }
  } else {
    await next();
  }
});

// If access to the page is not authorized
server.use(async (ctx) => {
  ctx.body = "C'est pas là !";
})

const serverCallback = server.callback();

// HTTPS webserver creation
/*try {
    const httpsServer = https.createServer(config.https.options, serverCallback);
    httpsServer.listen(config.https.port, function(err) {
        if (!!err) {
            console.error('HTTPS server FAIL: ', err, (err && err.stack));
        }
        else {
        console.log(`HTTPS server OK: https://${config.domain}:${config.https.port}`);
        }
    });
}
catch (ex) {
    console.error('Failed to start HTTPS server\n', ex, (ex && ex.stack));
}*/

http.createServer(serverCallback).listen(3000);
