// Runs once, when the MongoDB data volume is first created.
// Creates the API's own least-privilege user: readWrite on the app database only.
const appDb = db.getSiblingDB(process.env.MONGO_APP_DATABASE);
appDb.createUser({
  user: process.env.MONGO_APP_USERNAME,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: process.env.MONGO_APP_DATABASE }],
});
