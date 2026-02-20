require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
// trust proxy 설정을 해야 Railway 같은 클라우드 환경에서 실제 사용자 IP를 가져올 수 있습니다.
app.set("trust proxy", true);
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB 연결 성공"))
  .catch((err) => console.log("MongoDB 연결 실패", err));

const statSchema = new mongoose.Schema({
  name: { type: String, default: "portfolio" },
  likes: { type: Number, default: 0 },
  likedIPs: { type: [String], default: [] }, // ✨ 좋아요 누른 IP 목록 추가
});
const Stat = mongoose.model("Stat", statSchema);

const commentSchema = new mongoose.Schema({
  text: String,
  date: String,
  createdAt: { type: Date, default: Date.now },
});
const Comment = mongoose.model("Comment", commentSchema);

async function initDB() {
  try {
    const stat = await Stat.findOne({ name: "portfolio" });
    if (!stat)
      await new Stat({ name: "portfolio", likes: 0, likedIPs: [] }).save();
  } catch (err) {
    console.error("DB 초기화 에러:", err);
  }
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

// ✨ 클라이언트 IP를 가져오는 유틸리티 함수
const getClientIp = (req) => {
  return req.headers["x-forwarded-for"] || req.socket.remoteAddress;
};

app.get("/api/data", async (req, res) => {
  try {
    const stat = await Stat.findOne({ name: "portfolio" });
    const comments = await Comment.find().sort({ createdAt: -1 });
    const clientIp = getClientIp(req);

    // ✨ 현재 접속한 IP가 likedIPs 목록에 있는지 확인
    const userHasLiked = stat ? stat.likedIPs.includes(clientIp) : false;

    res.json({
      likes: stat ? stat.likes : 0,
      userHasLiked, // ✨ 프론트엔드로 전달
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
    const clientIp = getClientIp(req);
    let stat = await Stat.findOne({ name: "portfolio" });

    if (!stat) {
      stat = await new Stat({
        name: "portfolio",
        likes: 0,
        likedIPs: [],
      }).save();
    }

    const hasLiked = stat.likedIPs.includes(clientIp);

    if (hasLiked) {
      // 이미 좋아요를 눌렀다면: IP 제거 및 좋아요 수 감소
      stat = await Stat.findOneAndUpdate(
        { name: "portfolio" },
        {
          $inc: { likes: -1 },
          $pull: { likedIPs: clientIp },
        },
        { returnDocument: "after" },
      );
    } else {
      // 좋아요를 누르지 않았다면: IP 추가 및 좋아요 수 증가
      stat = await Stat.findOneAndUpdate(
        { name: "portfolio" },
        {
          $inc: { likes: 1 },
          $addToSet: { likedIPs: clientIp },
        },
        { returnDocument: "after" },
      );
    }

    res.json({
      success: true,
      likes: stat.likes,
      userHasLiked: !hasLiked, // ✨ 변경된 좋아요 상태 반환
    });
  } catch (err) {
    console.error("좋아요 업데이트 에러:", err);
    res.status(500).json({ success: false, message: err.message });
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
