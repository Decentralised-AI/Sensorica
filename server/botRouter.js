/* eslint-disable indent */
import express from 'express';
import { body, validationResult } from 'express-validator';
import constants from './constants.js';

import fs from 'fs';
import request from 'request';
import utils from './utils.js';

const router = new express.Router();

router.post(
  '/',
  [
    body('access_code')
      .trim()
      .notEmpty()
      .escape()
      .matches(new RegExp(constants.accessCode))
      .withMessage('Enter a valid code'),
  ],
  async (req, res) => {
    const result = validationResult(req);

    if (result.errors.length) {
      return res.status(401).send(`
        Not allowed. Wrong code.
      `);
    }

    res.send(`
      <form method="post" action="deploy">
        <br>
        telegram bot API token. <a href="https://t.me/BotFather" target=_blank>Get at BotFather</a><br>
        <input type='text' style='width:500px' name='tg_token' placeholder='57707394230:AAE33330Myi4tglJCdUrt9hsJd6J6Jo3D2tQ' value=''> <Br>
        <br>
        openAI API key <a href="https://platform.openai.com/" target=_blank>Get </a><br>
        <input type='text' style='width:500px' name='openai_sk' placeholder='' value=''> <Br>
        <Br>
        Prompt <a href="" target=_blank>examples</a>: <Br>
        <textarea style='width:500px;height:300px' name='prompt'></textarea>
        <br><br>
        <input type='submit' value='Send'>
      </form>
    `);
  },
);

router.post(
  '/deploy',
  [
    body('tg_token').notEmpty().withMessage('Please specify telegram API token'),
    body('openai_sk').notEmpty().withMessage('Please specify OpenAI API key'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const tg_token = utils.escapeAttr(req.body.tg_token);

    // telegram api get bit name by api key
    const api_url = `https://api.telegram.org/bot${tg_token}/getMe`;
    let bot_username;

    await request(api_url, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        const data = JSON.parse(body).result;
        bot_username = data.username.toLowerCase();
        console.log(`Bot username: ${bot_username}`);

        const nm = `${bot_username}${new Date().getDate()}_${new Date().getMonth()}_${new Date().getFullYear()}`;

        console.log('nm:' + nm);

        const { exec } = require('child_process');

        exec('wrangler kv:namespace create ' + nm, (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
            return res.status(400).json({ error: `Failed to create a KV. ${error}` });
          }

          // Find the ID in the stdout
          const regex = /id = "(\w+)"/;
          const match = regex.exec(stdout);
          const id = match ? match[1] : null;

          console.log(`Namespace ID: ${id}`);

          fs.writeFileSync(
            '/root/ChatGPT-Telegram-Workers/wrangler.toml',
            `name = "chatgpt-telegram-${bot_username}"
compatibility_date = "2023-03-04"
main = "./dist/index.js"
workers_dev = true

kv_namespaces = [
	{ binding = "DATABASE", id = "${id}" }
]

[vars]

API_KEY = "${utils.escapeAttr(req.body.openai_sk)}"
TELEGRAM_AVAILABLE_TOKENS = "${tg_token}"
CHAT_WHITE_LIST = ""
I_AM_A_GENEROUS_PERSON = "true"
`,
          );

          exec(
            'cd /root/ChatGPT-Telegram-Workers/ && npm run deploy:build',
            (error, stdout, stderr) => {
              if (error) {
                console.error(`exec deploy error: ${error}`);
                return res.status(400).json({ error: 'Failed to npm run deploy.' });
              }
              res.send('success');
            },
          );
        });
      } else {
        console.error(error);
        return res.status(400).json({ error: 'Failed to get telegram bot name.' });
      }
    });
  },
);

export default router;
