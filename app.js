require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { default: axios } = require('axios');
const app = express();
const fs = require('fs');
const createMergeRequest = require('./helpers/create-merge-request');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 });
const Authorization = `Bearer ${process.env.SLACK_TOKEN}`;
const dataPatchChannel = 'C01J5DTK5L7';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.options('*', cors());

app.post('/orion-slack-bot', async (req, res) => {
  const { challenge } = req.body;

  console.log(`Received slack event ${JSON.stringify(req.body)}`);
  if (req.body.event && req.body.event.channel_id === dataPatchChannel) {
    console.log('WE IN BUSINESS BOIS');
    const fileId = req.body.event.file_id;
    console.log(fileId, cache.has(fileId));
    if (!cache.has(fileId)) {
      const fileInfoResponse = await axios({
        method: 'GET',
        url: `https://slack.com/api/files.info?file=${fileId}`,
        headers: {
          Authorization,
        },
      });
      let downloadUrl;
      let fileName;
      if (fileInfoResponse.data.file.attachments) {
        downloadUrl = fileInfoResponse.data.file.attachments[0].url;
        fileName = fileInfoResponse.data.file.attachments[0].filename;
      } else {
        downloadUrl = fileInfoResponse.data.file.url_private_download;
        fileName = fileInfoResponse.data.file.name;
      }

      const downloadResponse = await axios({
        method: 'GET',
        url: downloadUrl,
        headers: {
          Authorization,
        },
        responseType: 'stream',
      });
      if (!fs.existsSync(`${__dirname}/files`)) {
        fs.mkdirSync(`${__dirname}/files`);
      }
      const path = `${__dirname}/files/${fileName}`;
      await downloadResponse.data
        .pipe(fs.createWriteStream(path))
        .on('finish', () => {
          cache.set(fileId, 1);
          createMergeRequest(path).then(() => {
            fs.unlinkSync(path);
          });
        });
    }
  }

  res.status(200).json({ challenge });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`App is running on port ${process.env.PORT || 3000}`);
});
