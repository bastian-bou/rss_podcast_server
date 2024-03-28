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


const staticPodcastPath = path.join(__dirname, 'contre_temps_pod');

/*const config = {
    domain: '', // the domain
    https: {
        port: 443, // any port that is open and not already used on your server
        options: {
        key: fs.readFileSync(path.resolve(process.cwd(), __dirname + '/../../certs/privkey.pem'), 'utf8').toString(),
        cert: fs.readFileSync(path.resolve(process.cwd(), __dirname + '/../../certs/fullchain.pem'), 'utf8').toString(),
        },
    },
};*/


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
                        // Update RSS feed here
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

const feed = new Podcast({
    title: 'titre',
    description: 'description',
    feedUrl: 'http://example.com/rss.xml',
    siteUrl: 'http://example.com',
    imageUrl: 'http://example.com/icon.png',
    docs: 'http://example.com/rss/docs.html',
    author: 'Dylan Greene',
    managingEditor: 'Dylan Greene',
    webMaster: 'Dylan Greene',
    copyright: '2013 Dylan Greene',
    language: 'fr',
    categories: ['Category 1','Category 2','Category 3'],
    pubDate: 'May 20, 2012 04:00:00 GMT',
    ttl: 60,
    itunesAuthor: 'Max Nowack',
    itunesSubtitle: 'I am a sub title',
    itunesSummary: 'I am a summary',
    itunesOwner: { name: 'Max Nowack', email: 'max@unsou.de' },
    itunesExplicit: false,
    itunesCategory: [{
        text: 'Entertainment',
        subcats: [{
          text: 'Television'
        }]
    }],
    itunesImage: 'http://example.com/image.png'
});

feed.addItem({
    title:  'item title',
    description: 'use this for the content. It can include html.',
    url: 'http://example.com/article4?this&that', // link to the item
    author: 'Guest Author', // optional - defaults to feed author property
    date: 'May 27, 2012', // any format that js Date can parse.
    enclosure : {url:'http://localhost/toto.xml', file:staticPodcastPath + '/toto.txt'}, // optional enclosure
    itunesAuthor: 'Max Nowack',
    itunesExplicit: false,
    itunesSubtitle: 'I am a sub title',
    itunesSummary: 'I am a summary',
    itunesDuration: 12345,
    itunesNewFeedUrl: 'https://newlocation.com/example.rss',
});

const server = new koa();

feedXml = feed.buildXml();

// Add the content of podcast folder available to the webserver
server.use(serve(staticPodcastPath));

// If someone wants the RSS
server.use(async(ctx, next) => {
    if (ctx.path === '/feed') {
        try {
            console.log(feedXml);
            ctx.type = 'application/xml';
            ctx.body = feedXml;
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