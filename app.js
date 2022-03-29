import axios from "axios";
import { aws4Interceptor } from "aws4-axios";
import { cli } from "cli-ux";

import "dotenv/config";

const botID = process.env.BOT_ID;
const aliasID = process.env.BOT_ALIAS;
const botLocale = "en_US";

const client = axios.create();

const interceptor = aws4Interceptor(
  {
    region: "us-east-1",
    service: "lex",
  },
  {
    accessKeyId: process.env.KEY_ID,
    secretAccessKey: process.env.AWS_SECRET,
  }
);

client.interceptors.request.use(interceptor);

async function detectIntent(textInput, sessionID) {
  const response = await client
    .post(
      `https://runtime-v2-lex.us-east-1.amazonaws.com/bots/${botID}/botAliases/${aliasID}/botLocales/${botLocale}/sessions/${sessionID}/text`,
      { text: textInput }
    )
    .then(
      (response) => {
        console.log(response.data.interpretations[0]);
        return response;
      },
      (error) => {
        console.log(error);
      }
    );

  const intent = response.data.interpretations[0].intent.name;
  const entities = response.data.interpretations[0].intent.slots;
  const nluConfidence = response.data.interpretations[0].nluConfidence.score;

  const createIntent = (name, value) => ({ name, value });
  const arr = [];

  for (const [key, value] of Object.entries(entities)) {
    if (value != null) {
      const intents = createIntent(key, value.value.interpretedValue);
      arr.push(intents);
    }
  }

  return { response: intent, entities: arr, confidence: nluConfidence };
}

async function interact(userID, request) {
  // call the Voiceflow API with the user's name & request, get back a response
  const response = await axios({
    method: "POST",
    url: `https://general-runtime.voiceflow.com/state/user/${userID}/interact`,
    headers: {
      Authorization: process.env.API_KEY,
    },
    data: {
      request,
    },
  });

  // loop through the response
  for (const trace of response.data) {
    switch (trace.type) {
      case "text":
      case "speak": {
        console.log(trace.payload.message);
        break;
      }
      case "end": {
        // an end trace means the the Voiceflow dialog has ended
        return false;
      }
    }
  }

  return true;
}

async function main() {
  const userID = await cli.prompt("> What is your name?");
  // send a simple launch request starting the dialog
  let isRunning = await interact(userID, { type: "launch" });

  while (isRunning) {
    const nextInput = await cli.prompt("> Say something");
    // send a simple text type request with the user input
    let intent = await detectIntent(nextInput, userID);
    console.log(intent.entities);
    isRunning = await interact(userID, {
      type: "intent",
      payload: {
        intent: {
          name: intent.response,
        },
        entities: intent.entities,
        confidence: intent.confidence,
      },
    });
  }
  console.log("The end! Start me again with `npm start`");
}

main();
