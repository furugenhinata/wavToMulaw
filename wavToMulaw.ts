import * as fs from "fs";

/**
 * バッファ内から特定のチャンクIDを持つチャンクを探す
 */
function findChunk(buffer: Buffer, chunkId: string): number {
  const targetChunk = Buffer.from(chunkId);

  // バッファ内を検索（12バイト目から開始）
  for (let i = 12; i < buffer.length - 4; i++) {
    if (
      buffer[i] === targetChunk[0] &&
      buffer[i + 1] === targetChunk[1] &&
      buffer[i + 2] === targetChunk[2] &&
      buffer[i + 3] === targetChunk[3]
    ) {
      return i;
    }
  }

  return -1; // 見つからない場合
}

/**
 * WAVファイルからPCMデータを抽出する
 */
function extractPcmFromWav(wavFilePath: string): {
  pcmData: Buffer;
} {
  // ファイル全体を読み込む
  const fileData = fs.readFileSync(wavFilePath);

  const dataChunkOffset = findChunk(fileData, "data");
  if (dataChunkOffset === -1) {
    throw new Error("Data chunk not found");
  }

  // dataチャンクのサイズを取得
  const dataSize = fileData.readUInt32LE(dataChunkOffset + 4);

  // dataチャンクの内容（実際のPCMデータ）を抽出
  const pcmData = fileData.slice(
    dataChunkOffset + 8,
    dataChunkOffset + 8 + dataSize
  );

  return { pcmData };
}

/**
 * 16ビットのリニアPCMサンプルをμ-law 8ビットサンプルに変換
 */
function linearToULaw(pcmVal: number, count: number): number {
  const SIGN_BIT = 0x80;
  const CLIP = 32635;
  const BIAS = 132;
  const QUANT_MASK = 0x0f;

  let sign = (pcmVal >> 8) & SIGN_BIT;
  const original_pcm = pcmVal;
  // 絶対値表現
  if (sign !== 0) {
    pcmVal = -pcmVal;
  }

  // クリッピング処理
  if (pcmVal > CLIP) {
    pcmVal = CLIP;
  }

  // バイアスを加える
  pcmVal = pcmVal + BIAS;

  let seg = 0;
  let val = pcmVal >> 7;

  if ((val & 0xf0) !== 0) {
    val >>= 4;
    seg += 4;
  }
  if ((val & 0x0c) !== 0) {
    val >>= 2;
    seg += 2;
  }
  if ((val & 0x02) !== 0) {
    seg += 1;
  }

  // 量子化ビットの計算と結合
  let uval: number;
  if (seg === 0) {
    uval = (pcmVal >> 4) & QUANT_MASK;
  } else {
    uval = (pcmVal >> (seg + 3)) & QUANT_MASK;
  }

  // セグメントと量子化ビットを組み合わせ
  uval = (seg << 4) | uval;

  // 符号ビットを追加し、全体を反転
  if (sign !== 0) {
    uval |= 0x80;
  }
  logToFile(original_pcm, uval, count);
  return ~uval & 0xff;
}

function logToFile(
  pcmValue: number,
  ulawValue: number,
  count: number,
  filename: string = "ulaw_log.txt"
): void {
  try {
    // ファイルに追記
    fs.appendFileSync(
      filename,
      `${count}, 元音:${pcmValue},変換後:${ulawValue}\n`
    );
  } catch (error) {
    console.error("Error writing to log file:", error);
  }
}
/**
 * 16ビットPCMデータをμ-lawに変換する
 */
function convertPcmToUlaw(pcmData: Buffer): Buffer {
  // PCMデータが16ビットであることを前提
  const ulawData = Buffer.alloc(pcmData.length / 2); // μ-lawは8ビットなので半分のサイズ
  console.log(pcmData);
  for (let i = 0; i < pcmData.length; i += 2) {
    if (i + 1 >= pcmData.length) break;

    // 16ビットPCMサンプルを取得（リトルエンディアン）
    const pcmSample = pcmData.readInt16LE(i);

    //console.log(pcmSample);

    // μ-law変換
    const ulawSample = linearToULaw(pcmSample, i);
    console.log(ulawSample);

    // 変換したサンプルを書き込み
    ulawData[i / 2] = ulawSample;
  }

  return ulawData;
}

/**
 * メイン処理
 */
function main(): void {
  // コマンドライン引数からファイルパスを取得
  const wavFilePath = process.argv[2];
  if (!wavFilePath) {
    console.error("使用方法: ts-node test2.ts <wavファイルパス>");
    process.exit(1);
  }

  try {
    const { pcmData } = extractPcmFromWav(wavFilePath);

    const ulawData = convertPcmToUlaw(pcmData);

    // const samplesToRemove = Math.floor(8000 * 0.1);
    // const trimmedData = ulawData.slice(samplesToRemove);

    const ulawFilePath = `${wavFilePath}.ulaw`;
    fs.writeFileSync(ulawFilePath, ulawData as unknown as Uint8Array);
  } catch (error) {
    console.error("エラー:", error);
  }
}

// メイン処理を実行
main();
