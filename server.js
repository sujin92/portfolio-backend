require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB 연결 성공"))
  .catch((err) => console.log("MongoDB 연결 실패", err));

const statSchema = new mongoose.Schema({
  name: { type: String, default: "portfolio" },
  likes: { type: Number, default: 0 },
});
const Stat = mongoose.model("Stat", statSchema);

const commentSchema = new mongoose.Schema({
  text: String,
  date: String,
  createdAt: { type: Date, default: Date.now },
});
const Comment = mongoose.model("Comment", commentSchema);

async function initDB() {
  const stat = await Stat.findOne({ name: "portfolio" });
  if (!stat) await new Stat({ name: "portfolio", likes: 0 }).save();
}
initDB();

let badWordsRegex = null;
let badWordsRegexGlobal = null;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

try {
  const filterPath = path.join(__dirname, "filter.txt");
  const filterData = fs.readFileSync(filterPath, "utf8");
  const badWords = filterData
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter((w) => w && !w.startsWith("#") && !w.startsWith("//"));

  if (badWords.length > 0) {
    const pattern = badWords.map(escapeRegExp).join("|");
    badWordsRegex = new RegExp(pattern, "iu");
    badWordsRegexGlobal = new RegExp(pattern, "giu");
  }
} catch (error) {
  console.error("필터 파일 에러");
}

function containsProfanity(text) {
  return badWordsRegex ? badWordsRegex.test(text) : false;
}
function getProfanityMatches(text) {
  if (!badWordsRegexGlobal) return [];
  const matches = text.match(badWordsRegexGlobal);
  return matches ? [...new Set(matches.map((m) => m.toLowerCase()))] : [];
}
function buildProfanityMessage(found) {
  const foundText = found?.length ? `"${found.join(", ")}" ` : "";
  return `🙅‍♀️ ${foundText} 🙊 That's a no-no`;
}

app.get("/api/data", async (req, res) => {
  try {
    const stat = await Stat.findOne({ name: "portfolio" });
    const comments = await Comment.find().sort({ createdAt: -1 });

    res.json({
      likes: stat ? stat.likes : 0,
      comments: comments.map((c) => ({
        id: c._id,
        text: c.text,
        date: c.date,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post("/api/like", async (req, res) => {
  try {
    const stat = await Stat.findOneAndUpdate(
      { name: "portfolio" },
      { $inc: { likes: 1 } },
      { new: true },
    );
    res.json({ success: true, likes: stat.likes });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post("/api/comment", async (req, res) => {
  const { text } = req.body;

  if (containsProfanity(text)) {
    const found = getProfanityMatches(text);
    return res.status(422).json({
      success: false,
      code: "PROFANITY",
      message: buildProfanityMessage(found),
      found,
    });
  }

  try {
    const newComment = new Comment({
      text: text.trim(),
      date: new Date().toISOString().split("T")[0],
    });
    await newComment.save();

    res.json({
      success: true,
      comment: {
        id: newComment._id,
        text: newComment.text,
        date: newComment.date,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
