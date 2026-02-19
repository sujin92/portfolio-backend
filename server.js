const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

let likes = 0;
let comments = [];

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
    .map((word) => word.trim())
    .filter((word) => {
      if (!word) return false;
      if (word.startsWith("#")) return false;
      if (word.startsWith("//")) return false;
      return true;
    });

  if (badWords.length > 0) {
    const pattern = badWords.map(escapeRegExp).join("|");
    badWordsRegex = new RegExp(pattern, "iu");
    badWordsRegexGlobal = new RegExp(pattern, "giu");
  } else {
    console.log();
  }
} catch (error) {
  console.error();
}

function containsProfanity(text) {
  if (!badWordsRegex) return false;
  return badWordsRegex.test(text);
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

app.get("/api/data", (req, res) => {
  res.json({ likes, comments });
});

app.post("/api/like", (req, res) => {
  likes += 1;
  res.json({ success: true, likes });
});

app.post("/api/comment", (req, res) => {
  const { text } = req.body;

  if (containsProfanity(text)) {
    const found = getProfanityMatches(text);
    const message = buildProfanityMessage(found);

    return res.status(422).json({
      success: false,
      code: "PROFANITY",
      message,
      found,
    });
  }

  const newComment = {
    id: Date.now(),
    text: text.trim(),
    date: new Date().toISOString().split("T")[0],
  };

  comments.unshift(newComment);

  res.json({ success: true, comment: newComment });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
