const AdmZip = require('adm-zip');
const axios = require('axios');
const createPatchFile = require('./patch-template');
const gitlabToken = `Bearer ${process.env.GITLAB_TOKEN}`;
const dataPatchChannel = 'C01J5DTK5L7';

function parseCsvToJson(csvData) {
  const rows = csvData.trim().replace(/"/g, '').split('\n');
  const keys = rows[0].trim().replace(/"/g, '').split(',');
  const dataParsed = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i].trim().split(',');
    const map = {};
    for (let j = 0; j < values.length; j++) {
      map[keys[j]] = values[j];
    }
    dataParsed.push(map);
  }
  return dataParsed;
}

function editGitlabYaml(yamlData, fileName) {
  const arr = yamlData.split('\n');
  let lastFoundIndex = -1;
  let scriptLineAt = -1;
  for (let i = 0; i < arr.length; i++) {
    const regex = /# - node/;
    const scriptRegex = /[ \t]script:/;
    if (regex.test(arr[i])) {
      lastFoundIndex = i;
    }
    if (scriptRegex.test(arr[i])) {
      scriptLineAt = i;
    }
  }
  if (lastFoundIndex === -1) {
    arr[
      scriptLineAt + 1
    ] = `    - node src/queries/query-transaction-history/${fileName}`;
  } else {
    arr[lastFoundIndex + 1] = `    # - ${arr[lastFoundIndex + 1].slice(6)}`;
    const newScript = `    - node src/queries/query-transaction-history/${fileName}`;
    arr.splice(lastFoundIndex + 2, 0, newScript);
  }
  return arr.join('\n');
}

async function createMergeRequest(fileInputPath) {
  console.log(fileInputPath);
  const zip = new AdmZip(fileInputPath);
  const zipEntries = zip.getEntries(); // an array of ZipEntry records

  zipEntries.forEach(async function (zipEntry) {
    const csvData = zipEntry.getData().toString('utf8');
    if (csvData) {
      const dataParsed = parseCsvToJson(csvData);
      const transactionIds = dataParsed.map((d) => d.mambu_transaction_id);

      const dateTime = new Date().getTime();
      const date = new Date().toISOString().split('T')[0];
      const patchFile = createPatchFile(JSON.stringify(transactionIds));
      const fileName = `${date}-transaction-history-reconciliation-${dateTime}.js`;

      const gitlabYamlResponse = await axios({
        method: 'GET',
        url: 'https://gitlab.com/api/v4/projects/27702188/repository/files/.gitlab-ci.yml/raw',
        headers: {
          Authorization: gitlabToken,
        },
      });
      const gitlabYamlFile = editGitlabYaml(gitlabYamlResponse.data, fileName);

      const branchName = `feature/orion-automation-${dateTime}`;
      const createBranch = await axios({
        method: 'POST',
        url: `https://gitlab.com/api/v4/projects/27702188/repository/branches?branch=${branchName}&ref=master`,
        headers: {
          Authorization: gitlabToken,
        },
      });

      const commitPatchFile = await axios({
        method: 'POST',
        url: `https://gitlab.com/api/v4/projects/27702188/repository/files/${encodeURIComponent(
          `src/queries/query-transaction-history/${fileName}`
        )}`,
        headers: {
          Authorization: gitlabToken,
        },
        data: {
          branch: branchName,
          author_email: 'filbert@dkatalis.com',
          author_name: 'Filbert Filbert',
          content: patchFile,
          commit_message: `Patch transaction history reconciliation for ${date}`,
        },
      });
      console.log('Patch file commited');

      const commitGitlabYaml = await axios({
        method: 'PUT',
        url: 'https://gitlab.com/api/v4/projects/27702188/repository/files/.gitlab-ci.yml',
        headers: {
          Authorization: gitlabToken,
        },
        data: {
          branch: branchName,
          author_email: 'filbert@dkatalis.com',
          author_name: 'Filbert Filbert',
          content: gitlabYamlFile,
          commit_message: 'update gitlab ci script',
        },
      });
      console.log('Gitlab CI yaml updated');

      const createMergeRequest = await axios({
        method: 'POST',
        url: `https://gitlab.com/api/v4/projects/27702188/merge_requests`,
        headers: {
          Authorization: gitlabToken,
        },
        data: {
          source_branch: branchName,
          target_branch: 'master',
          title: `Patch transaction history reconciliation ${date}`,
        },
      });
      if (createMergeRequest.data) {
        console.log('Merge request created');
        axios({
          method: 'POST',
          url: 'https://slack.com/api/chat.postMessage',
          headers: {
            Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          },
          data: {
            channel: dataPatchChannel,
            text: `New psuedo-pam Merge Request created at ${createMergeRequest.data.web_url}`,
          },
        })
          .then((resp) => {
            console.log(resp.data);
          })
          .catch((err) => {
            console.log(err.response.data);
          });
      }
      return null;
    }
  });
}

// createMergeRequest(
//   `/Users/useradmin/AndroidStudioProjects/microservices/patch-automation/files/transaction_reconciliation_email_file_2022-01-11.csv.zip`
// );

module.exports = createMergeRequest;
