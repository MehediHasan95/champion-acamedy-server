const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const client = new MongoClient(
  `mongodb+srv://${process.env.BUCKET_NAME}:${process.env.SECRET_KEY}@cluster0.mnvzcly.mongodb.net/?retryWrites=true&w=majority`,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  }
);

async function run() {
  try {
    app.get("/", (req, res) =>
      res.send("Champion Academy server run successfully")
    );
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("You successfully connected to MongoDB!");

    // ----
    const championDB = client.db("championAcademyDB");
    const userCollection = championDB.collection("users");
    // ----

    app.get("/users", async (req, res) => {
      const results = await userCollection.find().toArray();
      res.send(results);
    });

    app.post("/users", async (req, res) => {
      const users = req.body;
      const isExist = await userCollection.findOne({ uid: { $eq: users.uid } });
      if (!isExist) {
        const result = await userCollection.insertOne(users);
        res.send(result);
      }
    });
  } finally {
    app.listen(port, () =>
      console.log("Champion Academy server is running successfully")
    );
  }
}
run().catch(console.dir);
