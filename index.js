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

const domainName = 'contretempsvoyage.fr'
const url = 'https://' + domainName;
const staticPodcastPath = path.join(__dirname, 'contre_temps_pod');
const podJsonPath = '/podcast.json';
const podImgPath = '/podcast.jpg';

/*const config = {
    domain: domainName,
    https: {
        port: 443, // any port that is open and not already used on your server
        options: {
        key: fs.readFileSync(path.resolve(process.cwd(), __dirname + '/../../certs/privkey.pem'), 'utf8').toString(),
        cert: fs.readFileSync(path.resolve(process.cwd(), __dirname + '/../../certs/fullchain.pem'), 'utf8').toString(),
        },
    },
};*/


function readJSONFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Erreur lors de la lecture du fichier JSON ${filePath}:`, error);
    return null;
  }
}

function addEpisod(jsonFile, audioFile, imageFile) {
  feed.addItem({
    title: jsonFile.title,
    description: jsonFile.description,
    url: url + '/' + audioFile, // link to the item
    date: jsonFile.date, // any format that js Date can parse.
    enclosure: { url: url + '/' + audioFile, file: staticPodcastPath + '/' + audioFile }, // optional enclosure
    itunesExplicit: false,
    itunesDuration: jsonFile.duration,
    itunesImage: url + imageFile
  });
}

/**
 * @param {*} folderPath The folder where to check the contents
 * @returns True or false if there is all useful files or not
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
          resolve(true);
        } else {
          resolve(false);
        }
      }
    });
  });
}

// Check the content of the podcast folder
fs.watch(staticPodcastPath, { recursive: false }, async (eventType, filename) => {
  if (eventType === 'rename') {
    // When a change is detected in the public folder
    const fullPath = path.join(staticPodcastPath, filename);

    // Check if the modified item is a folder
    fs.stat(fullPath, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
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
          const isContentValid = await checkFolderContent(folderPath);
          if (isContentValid) {
            console.log(`The necessary files are located in the ${filename}`);
            // Add episod image or podcast image
            const episodeImagePath = path.join(folderPath, 'episod.jpg');
            let imageUrl;
            if (fs.existsSync(episodeImagePath)) {
              imageUrl = '/' + filename + '/episod.jpg';
            } else {
              imageUrl = podImgPath;
            }
            // Update RSS feed here
            addEpisod(readJSONFile(folderPath + '/episod.json'), filename + '/episod.m4a', imageUrl);
            clearInterval(interval); // Stop periodic verification
          } else {
            console.log(`Not all the necessary files are in ${filename}`);
          }
        }, 1000); // Check every second

        // Stop verification after 30 seconds
        setTimeout(() => {
          clearInterval(interval);
        }, 30000); // 30 seconds
      }
    });
  } else if (eventType === 'unlink') {
    // When an item is deleted from the podcast folder
    console.log(`Deleted item : ${filename}`);
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
  ctx.status = 404;
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