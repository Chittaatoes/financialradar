import imageCompression from "browser-image-compression";

// Persistent Tesseract worker — created once, reused across all scans.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _worker: any = null;
let _workerReady = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorker(): Promise<any> {
  if (_worker && _workerReady) return _worker;

  const { createWorker } = await import("tesseract.js");
  _worker = await createWorker("eng+ind", 1, { logger: () => {} });
  _workerReady = true;
  return _worker;
}

// Compress the image before preprocessing to speed up OCR on mobile.
async function compressImage(file: File): Promise<File> {
  return imageCompression(file, {
    maxSizeMB: 0.6,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
  });
}

// Preprocess receipt image with Canvas API to improve OCR accuracy.
// Converts to grayscale and boosts contrast.
async function preprocessImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const MAX_WIDTH = 1200;
      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // Grayscale + contrast boost
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const CONTRAST = 1.5;
      for (let i = 0; i < d.length; i += 4) {
        const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        const adj = Math.min(255, Math.max(0, Math.round((gray - 128) * CONTRAST + 128)));
        d[i] = d[i + 1] = d[i + 2] = adj;
      }
      ctx.putImageData(imgData, 0, 0);

      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(URL.createObjectURL(blob));
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/png",
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

// Run Tesseract OCR on a receipt image.
// Pipeline: compress → preprocess → OCR (persistent worker).
export async function runOCR(file: File): Promise<string> {
  let processedFile = file;

  // Step 1: compress
  try {
    processedFile = await compressImage(file);
  } catch {
    // Fall back to original file if compression fails
    processedFile = file;
  }

  // Step 2: preprocess
  let src: string | File = processedFile;
  try {
    src = await preprocessImage(processedFile);
  } catch {
    // Fall back to compressed file if canvas preprocessing fails
  }

  // Step 3: OCR with persistent worker
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(src as string);

    if (typeof src === "string" && src.startsWith("blob:")) {
      URL.revokeObjectURL(src);
    }

    return data.text;
  } catch {
    // Worker may have failed — reset and fall back to one-time recognize
    _worker = null;
    _workerReady = false;

    const { recognize } = await import("tesseract.js");
    const { data: { text } } = await recognize(src as string, "eng+ind", {
      logger: () => {},
    });

    if (typeof src === "string" && src.startsWith("blob:")) {
      URL.revokeObjectURL(src);
    }

    return text;
  }
}
