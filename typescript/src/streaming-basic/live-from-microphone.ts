import { exit } from "process";
import WebSocket, { WebSocketServer } from "ws";
import mic from "mic";

const SAMPLE_RATE = 16_000;

import OpenAI from "openai";

const openai = new OpenAI();

async function translate(text: string) {
  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are a Japanese translator. Translate the following texts from another language to Japanese. Only return the Japanese translation. ",
      },
      { role: "user", content: text },
    ],
    model: "gpt-3.5-turbo-0125",
  });
  // console.log(completion.choices[0].message.content);
  return completion.choices[0].message.content;
}

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', function connection(ws) {
  console.log('A new client connected.');
  ws.on('message', function message(data) {
    // Assuming data is a Blob from MediaRecorder
    if (data instanceof Buffer) {
      // Convert the received Buffer to a format that can be sent to Gladia API
      const base64Audio = data.toString('base64');
      
      // Now, send this audio to the Gladia API for transcription
      // For simplicity, we are directly using the WebSocket connection to the Gladia API opened below
      // In a real application, you should properly handle the connection lifecycle and errors
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ frames: base64Audio }));
      } else {
        console.log("WebSocket connection to Gladia API is not open.");
      }
    } else {
      console.log("Received non-binary data");
    }
  });
});

/**
 * Generalized function to broadcast messages to all clients.
 * @param messageType - Specifies whether the message is a 'translation' or 'transcription'.
 * @param textStatus - Specifies whether the text is 'partial' or 'full'.
 * @param text - The actual text to be sent.
 */

// Function to broadcast messages to all clients
function broadcastMessage(messageType: any, textStatus: any, text: any) {
  const message = JSON.stringify({
    message_type: messageType, // 'translation' or 'transcription'
    text_status: textStatus,   // 'partial' or 'full'
    text: text                 // The text content
  });
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// retrieve gladia key
const gladiaKey = process.argv[2];
if (!gladiaKey) {
  console.error("You must provide a gladia key. Go to app.gladia.io");
  exit(1);
} else {
  console.log("using the gladia key : " + gladiaKey);
}

const gladiaUrl = "wss://api.gladia.io/audio/text/audio-transcription";

// connect to api websocket
const socket = new WebSocket(gladiaUrl);

// get ready to receive transcriptions
socket.on("message", (event: any) => {
  if (!event) return;

  const utterance = JSON.parse(event.toString());

  if (!Object.keys(utterance).length) {
    console.log("Empty ...");
    return;
  }

  if (utterance.event === "connected") {
    console.log(`\n* Connection id: ${utterance.request_id} *\n`);
  } else if (utterance.event === "error") {
    console.error(`[${utterance.code}] ${utterance.message}`);
    socket.close();
  } else if (utterance.event === "transcript" && utterance.transcription) {
    broadcastMessage('transcription', utterance.type, utterance.transcription);
    console.log(
      `${utterance.type}: (${utterance.language}) ${utterance.transcription}`
    );
    const text_type = utterance.type;
    translate(utterance.transcription).then(translated_text => {
      broadcastMessage('translation', text_type, translated_text);
  }).catch(err => console.error(err));
}
});

socket.on("error", (error: WebSocket.ErrorEvent) => {
  console.log("An error occurred:", error.message);
});

socket.on("close", () => {
  console.log("Connection closed");
});

socket.on("open", async () => {
  // Configure stream with a configuration message
  const configuration = {
    x_gladia_key: gladiaKey,
    language_behaviour: "automatic multiple languages",
    sample_rate: SAMPLE_RATE,
    // "model_type":"accurate" <- Slower but more accurate model, useful if you need precise addresses for example.
  };
  socket.send(JSON.stringify(configuration));

});
