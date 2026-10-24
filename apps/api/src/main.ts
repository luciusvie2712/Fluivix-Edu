import { createApp } from "./app";
import { config } from "./config";
void createApp().then((app) => app.listen(config().PORT, config().API_HOST));
