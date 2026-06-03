import { createApp } from "./app";

const port = Number(process.env.PORT || 4001);
createApp().listen(port, () => {
  console.log(`WealthTrack backend listening on ${port}`);
});
