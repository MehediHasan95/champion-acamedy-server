const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

async function run() {
  try {
    app.get("/", (req, res) =>
      res.send("Champion Academy server run successfully")
    );
  } finally {
    app.listen(port, () =>
      console.log("Champion Academy server is running successfully")
    );
  }
}
run().catch(console.dir);
