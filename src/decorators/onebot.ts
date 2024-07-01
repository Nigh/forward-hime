import {Element, Session, h} from "koishi";

function cqJsonTranslator(content: Element[], elem: Element) {
	let json = JSON.parse(elem.attrs.data);
	let hit = 0;
	if (json) {
		if (json.prompt) {
			hit += 1;
			content.push(h("p", `${json.prompt}`));
		}
		if (json.meta && json.meta.detail_1) {
			if (json.meta.detail_1.preview) {
				hit += 1;
				content.push(h.image(json.meta.detail_1.preview, "image/jpeg"));
			}
			if (json.meta.detail_1.qqdocurl) {
				hit += 1;
				content.push(h("span", `${json.meta.detail_1.qqdocurl}`));
			}
		}
	}
	if (hit === 0) {
		content.push(h("span", `[CQ:JSON消息]`));
	}
}

function Middleware(session: Session) {
	const platform = guessPlatform(session);

	let newContent: Element[] = [];
	let head: Element[] = [
		h("b", `${session.username}`),
		h("span", " 转发自 "),
		h("i", `${platform}`),
		h("span", `：`),
	];
	if (platform === "QQ") {
		for (const key in session.elements) {
			switch (session.elements[key].type) {
				case "forward":
					newContent.push(h("span", `[CQ:转发消息]`));
					break;
				case "json":
					cqJsonTranslator(newContent, session.elements[key]);
					break;
				case "mface":
					newContent.push(h.image(session.elements[key].attrs.url));
					break;
				default:
					newContent.push(session.elements[key]);
					break;
			}
		}
		return {head: head, content: newContent};
	}
	return {head: head, content: session.elements};
}

function guessPlatform(session: Session) {
	if (session.event.user && session.event.user.avatar) {
		if (session.event.user.avatar.includes("q.qlogo.cn")) {
			return "QQ";
		}
	}
	return session.platform;
}

export default {
	Middleware,
};
