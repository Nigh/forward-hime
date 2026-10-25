import sharp from "sharp";

export interface ImageCompressionConfig {
	Enabled?: boolean;
	InputSizeMB?: number;
	TargetSizeMB?: number;
}

export const DEFAULT_IMAGE_COMPRESSION = {
	Enabled: true,
	InputSizeMB: 2,
	TargetSizeMB: 1,
};

export async function compressRelayImage(
	buffer: Buffer,
	mime: string,
	config: ImageCompressionConfig,
) {
	const enabled = config.Enabled ?? DEFAULT_IMAGE_COMPRESSION.Enabled;
	const inputSize = config.InputSizeMB ?? DEFAULT_IMAGE_COMPRESSION.InputSizeMB;
	const targetSize = config.TargetSizeMB ?? DEFAULT_IMAGE_COMPRESSION.TargetSizeMB;

	if (!enabled) return {buffer, mime};
	if (
		!Number.isFinite(inputSize) ||
		inputSize <= 0 ||
		!Number.isFinite(targetSize) ||
		targetSize <= 0
	) {
		throw new Error("image compression sizes must be positive finite numbers");
	}
	if (buffer.length <= inputSize * 1024 * 1024) return {buffer, mime};

	const image = sharp(buffer);
	const metadata = await image.metadata();

	if (metadata.format === "gif" || (metadata.pages ?? 1) > 1) {
		return {buffer, mime};
	}

	const targetBytes = Math.floor(targetSize * 1024 * 1024);

	// Flatten static image transparency against white.
	const prepared = image.rotate().flatten({background: "#ffffff"});
	let result = await prepared
		.clone()
		.jpeg({quality: 80})
		.toBuffer({resolveWithObject: true});

	while (result.data.length > targetBytes) {
		const {width, height} = result.info;

		if (width === 1 && height === 1) {
			throw new Error(`JPEG cannot fit image target of ${targetBytes} bytes`);
		}
		const scale = Math.min(0.9, Math.sqrt(targetBytes / result.data.length) * 0.9);

		result = await prepared
			.clone()
			.resize({
				width: Math.max(1, Math.floor(width * scale)),
				height: Math.max(1, Math.floor(height * scale)),
				fit: "inside",
				withoutEnlargement: true,
			})
			.jpeg({quality: 80})
			.toBuffer({resolveWithObject: true});
	}

	return {buffer: result.data, mime: "image/jpeg"};
}
