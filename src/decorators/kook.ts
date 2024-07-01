import {Element, h} from "koishi";
import {Buffer} from "buffer";
const transparentPixel = Buffer.from(
	"R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
	"base64",
);

function Decorator({head, content}) {
	let msg: Element[] = [];
	let hasImage = false;
	for (const key in content) {
		if (content[key].type === "image") {
			hasImage = true;
		}
	}
	msg = msg.concat(head, h("br"), content);
	if (!hasImage) {
		msg = msg.concat(h.image(transparentPixel, "image/gif"));
	}
	return msg;
}

export default {
	Decorator,
};
