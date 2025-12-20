/**
 * Process an image file: resize if too large, convert to JPEG, and return as base64 string.
 * This ensures compatibility (e.g., for HEIC files) and reduces payload size.
 * 
 * @param {File} file - The input file to process
 * @param {Object} options - Configuration options
 * @param {number} options.maxDimension - Max width or height (default: 1920)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.7)
 * @returns {Promise<string>} - Base64 data URL of the processed image
 */
export const processImage = (file, options = {}) => {
    const { maxDimension = 1920, quality = 0.7 } = options;

    return new Promise((resolve, reject) => {
        // 1. Read file
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read image file'));

        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Failed to load image for processing'));

            img.onload = () => {
                // 2. Calculate new dimensions
                let width = img.width;
                let height = img.height;

                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                // 3. Draw to canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Draw image (browser handles EXIF orientation mostly automatically now)
                ctx.drawImage(img, 0, 0, width, height);

                // 4. Export as JPEG (forces format normalization)
                // This converts PNG, HEIC (if browser supported decoding), etc. to JPEG
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    });
};
