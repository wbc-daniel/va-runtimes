var VectorAnimateWeb = (function(exports) {

Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

//#region src/scene/scene-node.ts
	const IDENTITY = [
		1,
		0,
		0,
		1,
		0,
		0
	];
	/** Returns true when m is (within floating-point tolerance) the identity. */
	function isIdentity(m) {
		return Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[4]) < 1e-9 && Math.abs(m[5]) < 1e-9;
	}
	/** A × B — applies B first, then A. */
	function multiplyMatrices(A, B) {
		return [
			A[0] * B[0] + A[2] * B[1],
			A[1] * B[0] + A[3] * B[1],
			A[0] * B[2] + A[2] * B[3],
			A[1] * B[2] + A[3] * B[3],
			A[0] * B[4] + A[2] * B[5] + A[4],
			A[1] * B[4] + A[3] * B[5] + A[5]
		];
	}

//#endregion
//#region src/scene/path-parser.ts
/**
	* Parses an SVG `d` attribute string into a Path2D + bounds.
	*
	* The browser's Path2D constructor handles the full SVG path spec natively;
	* bounds come from a shared hidden <svg>/<path> helper element via
	* `getBBox()` (the only reliable way to get bounds for an arbitrary
	* Path2D).
	*/
	function parseSvgPath(d, warnings) {
		const trimmed = d.trim();
		if (!trimmed) return null;
		try {
			const m = getPathMetrics(trimmed);
			return {
				path: new Path2D(trimmed),
				bounds: m.bounds,
				length: m.length,
				closed: /[zZ]\s*$/.test(trimmed)
			};
		} catch (e) {
			warnings.push(`failed to parse <path d="...">: ${String(e)}`);
			return null;
		}
	}
	function makeRectPath(x, y, w, h, rx, ry) {
		if (w <= 0 || h <= 0) return emptyGeometry();
		if (rx === 0 && ry === 0) return {
			path: new Path2D(`M${x},${y}h${w}v${h}h${-w}Z`),
			bounds: {
				x,
				y,
				width: w,
				height: h
			},
			length: 2 * (w + h),
			closed: true
		};
		const rxC = Math.min(rx, w / 2);
		const ryC = Math.min(ry, h / 2);
		const d = `M${x + rxC},${y}H${x + w - rxC}A${rxC},${ryC} 0 0 1 ${x + w},${y + ryC}V${y + h - ryC}A${rxC},${ryC} 0 0 1 ${x + w - rxC},${y + h}H${x + rxC}A${rxC},${ryC} 0 0 1 ${x},${y + h - ryC}V${y + ryC}A${rxC},${ryC} 0 0 1 ${x + rxC},${y}Z`;
		const arcLen = ellipsePerimeter(rxC, ryC);
		const length = 2 * (w - 2 * rxC) + 2 * (h - 2 * ryC) + arcLen;
		return {
			path: new Path2D(d),
			bounds: {
				x,
				y,
				width: w,
				height: h
			},
			length,
			closed: true
		};
	}
	function makeCirclePath(cx, cy, r) {
		if (r <= 0) return emptyGeometry();
		return {
			path: new Path2D(`M${cx - r},${cy}A${r},${r} 0 1,0 ${cx + r},${cy}A${r},${r} 0 1,0 ${cx - r},${cy}`),
			bounds: {
				x: cx - r,
				y: cy - r,
				width: r * 2,
				height: r * 2
			},
			length: 2 * Math.PI * r,
			closed: true
		};
	}
	function makeEllipsePath(cx, cy, rx, ry) {
		if (rx <= 0 || ry <= 0) return emptyGeometry();
		return {
			path: new Path2D(`M${cx - rx},${cy}A${rx},${ry} 0 1,0 ${cx + rx},${cy}A${rx},${ry} 0 1,0 ${cx - rx},${cy}`),
			bounds: {
				x: cx - rx,
				y: cy - ry,
				width: rx * 2,
				height: ry * 2
			},
			length: ellipsePerimeter(rx, ry),
			closed: true
		};
	}
	function makeLinePath(x1, y1, x2, y2) {
		const path = new Path2D(`M${x1},${y1}L${x2},${y2}`);
		const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
		const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
		return {
			path,
			bounds: {
				x: minX,
				y: minY,
				width: maxX - minX,
				height: maxY - minY
			},
			length: Math.hypot(x2 - x1, y2 - y1),
			closed: false
		};
	}
	function makePolyPath(pointsAttr, close) {
		const nums = parseNumberList(pointsAttr);
		if (nums.length < 4) return emptyGeometry();
		let d = `M${nums[0]},${nums[1]}`;
		let minX = nums[0], maxX = nums[0], minY = nums[1], maxY = nums[1];
		let length = 0;
		let prevX = nums[0], prevY = nums[1];
		for (let i = 2; i + 1 < nums.length; i += 2) {
			const px = nums[i], py = nums[i + 1];
			d += `L${px},${py}`;
			length += Math.hypot(px - prevX, py - prevY);
			prevX = px;
			prevY = py;
			if (px < minX) minX = px;
			if (px > maxX) maxX = px;
			if (py < minY) minY = py;
			if (py > maxY) maxY = py;
		}
		if (close) {
			d += "Z";
			length += Math.hypot(nums[0] - prevX, nums[1] - prevY);
		}
		return {
			path: new Path2D(d),
			bounds: {
				x: minX,
				y: minY,
				width: maxX - minX,
				height: maxY - minY
			},
			length,
			closed: close
		};
	}
	function emptyGeometry() {
		return {
			path: new Path2D(),
			bounds: {
				x: 0,
				y: 0,
				width: 0,
				height: 0
			},
			length: 0,
			closed: false
		};
	}
	/** Ramanujan's second approximation; <0.04 % error for any aspect ratio. */
	function ellipsePerimeter(rx, ry) {
		if (rx <= 0 || ry <= 0) return 0;
		const h = Math.pow(rx - ry, 2) / Math.pow(rx + ry, 2);
		return Math.PI * (rx + ry) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
	}
	let _boundsHelper = null;
	function getPathMetrics(d) {
		const helper = boundsHelper();
		if (!helper) return {
			bounds: {
				x: 0,
				y: 0,
				width: 0,
				height: 0
			},
			length: 0
		};
		helper.path.setAttribute("d", d);
		try {
			const b = helper.path.getBBox();
			let length = 0;
			try {
				length = helper.path.getTotalLength();
			} catch {}
			return {
				bounds: {
					x: b.x,
					y: b.y,
					width: b.width,
					height: b.height
				},
				length
			};
		} catch {
			return {
				bounds: {
					x: 0,
					y: 0,
					width: 0,
					height: 0
				},
				length: 0
			};
		}
	}
	function boundsHelper() {
		if (_boundsHelper) return _boundsHelper;
		if (typeof document === "undefined") return null;
		const ns = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(ns, "svg");
		const path = document.createElementNS(ns, "path");
		svg.appendChild(path);
		svg.setAttribute("width", "0");
		svg.setAttribute("height", "0");
		svg.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:-9999px";
		document.body.appendChild(svg);
		_boundsHelper = {
			svg,
			path
		};
		return _boundsHelper;
	}
	const NUM_RE = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;
	function parseNumberList(s) {
		const out = [];
		let m;
		NUM_RE.lastIndex = 0;
		while ((m = NUM_RE.exec(s)) !== null) out.push(parseFloat(m[0]));
		return out;
	}

//#endregion
//#region src/scene/svg-parser.ts
/**
	* Parses the `svgRaw` field of a .var.json document into a SceneNode tree.
	* Unsupported elements/attributes produce entries in warnings rather than
	* throwing.
	*/
	function parseSvg(svgRaw) {
		const warnings = [];
		const doc = new DOMParser().parseFromString(svgRaw, "image/svg+xml");
		const parseError = doc.querySelector("parsererror");
		if (parseError) warnings.push(`SVG parse error: ${parseError.textContent?.trim() ?? "unknown"}`);
		const rootEl = doc.documentElement;
		if (rootEl.localName !== "svg") warnings.push(`expected root <svg>, got <${rootEl.localName}>`);
		const idIndex = /* @__PURE__ */ new Map();
		buildIdIndex(rootEl, idIndex);
		const root = parseElement$1(rootEl, INHERITED_INITIAL, {
			idIndex,
			warnings,
			classRules: collectClassRules(rootEl)
		});
		const sceneIndex = /* @__PURE__ */ new Map();
		buildSceneIndex(root, sceneIndex);
		return {
			root,
			sceneIndex,
			warnings
		};
	}
	function buildSceneIndex(node, out) {
		if (node.id !== null) out.set(node.id, node);
		for (const child of node.children) buildSceneIndex(child, out);
	}
	function buildIdIndex(el, out) {
		const id = el.getAttribute("id");
		if (id) out.set(id, el);
		for (const child of el.children) buildIdIndex(child, out);
	}
	function collectClassRules(root) {
		const map = /* @__PURE__ */ new Map();
		const visit = (el) => {
			if (el.localName === "style") parseStylesheet(el.textContent ?? "", map);
			for (const child of el.children) visit(child);
		};
		visit(root);
		return map;
	}
	function parseStylesheet(css, out) {
		const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
		const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
		let m;
		while ((m = ruleRe.exec(stripped)) !== null) {
			const selectors = (m[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
			const decls = parseDeclarations(m[2] ?? "");
			if (decls.size === 0) continue;
			for (const sel of selectors) {
				if (!/^\.[A-Za-z_][\w-]*$/.test(sel)) continue;
				const cls = sel.slice(1);
				let bucket = out.get(cls);
				if (!bucket) {
					bucket = /* @__PURE__ */ new Map();
					out.set(cls, bucket);
				}
				for (const [k, v] of decls) bucket.set(k, v);
			}
		}
	}
	function parseDeclarations(body) {
		const out = /* @__PURE__ */ new Map();
		for (const decl of body.split(";")) {
			const idx = decl.indexOf(":");
			if (idx <= 0) continue;
			const k = decl.slice(0, idx).trim().toLowerCase();
			const v = decl.slice(idx + 1).trim();
			if (k && v) out.set(k, v);
		}
		return out;
	}
	function lookupClassValue(classAttr, classRules, prop) {
		if (!classAttr) return null;
		let value = null;
		for (const cls of classAttr.split(/\s+/)) {
			if (!cls) continue;
			const v = classRules.get(cls)?.get(prop);
			if (v !== void 0) value = v;
		}
		return value;
	}
	/** SVG initial values: fill=black, stroke=none, stroke-width=1. */
	const INHERITED_INITIAL = {
		fill: {
			kind: "solid",
			argb: 4278190080
		},
		stroke: null,
		strokeWidth: 1,
		strokeLinecap: "butt",
		strokeLinejoin: "miter",
		strokeDashArray: [],
		strokeDashOffset: 0,
		fillOpacity: 1,
		strokeOpacity: 1
	};
	function applyAttrs(el, parent, ctx) {
		const style = parseStyleAttr(el.getAttribute("style"));
		const classAttr = el.getAttribute("class");
		const lookup = (name) => el.getAttribute(name) ?? style.get(name) ?? lookupClassValue(classAttr, ctx.classRules, name) ?? null;
		let fill = parent.fill;
		const fillRaw = lookup("fill");
		if (fillRaw !== null) fill = parsePaintReference(fillRaw, ctx);
		let stroke = parent.stroke;
		const strokeRaw = lookup("stroke");
		if (strokeRaw !== null) stroke = parsePaintReference(strokeRaw, ctx);
		const strokeWidth = parseDouble(lookup("stroke-width")) ?? parent.strokeWidth;
		const fillOpacity = parseDouble(lookup("fill-opacity")) ?? parent.fillOpacity;
		const strokeOpacity = parseDouble(lookup("stroke-opacity")) ?? parent.strokeOpacity;
		const linecapRaw = lookup("stroke-linecap");
		const strokeLinecap = linecapRaw === "round" ? "round" : linecapRaw === "square" ? "square" : parent.strokeLinecap;
		const linejoinRaw = lookup("stroke-linejoin");
		const strokeLinejoin = linejoinRaw === "round" ? "round" : linejoinRaw === "bevel" ? "bevel" : parent.strokeLinejoin;
		const dashRaw = lookup("stroke-dasharray");
		const strokeDashArray = dashRaw !== null ? parseDashArray(dashRaw) : parent.strokeDashArray;
		const strokeDashOffset = parseDouble(lookup("stroke-dashoffset")) ?? parent.strokeDashOffset;
		return {
			fill,
			stroke,
			strokeWidth,
			strokeLinecap,
			strokeLinejoin,
			strokeDashArray,
			strokeDashOffset,
			fillOpacity,
			strokeOpacity
		};
	}
	/**
	* Parses an SVG stroke-dasharray string into a list of non-negative numbers.
	* Returns [] for `none`, empty input, or any negative value (per SVG spec
	* the property is invalid in those cases). An odd-length list is repeated
	* once so the dash/gap alternation closes cleanly, matching browser behaviour.
	*/
	function parseDashArray(raw) {
		const s = raw.trim().toLowerCase();
		if (!s || s === "none") return [];
		const nums = [];
		for (const tok of raw.split(/[\s,]+/)) {
			if (!tok) continue;
			const n = parseFloat(tok);
			if (isNaN(n) || n < 0) return [];
			nums.push(n);
		}
		if (nums.length === 0) return [];
		if (nums.every((n) => n === 0)) return [];
		if (nums.length % 2 === 1) return [...nums, ...nums];
		return nums;
	}
	function parseStyleAttr(raw) {
		const out = /* @__PURE__ */ new Map();
		if (!raw) return out;
		for (const decl of raw.split(";")) {
			const idx = decl.indexOf(":");
			if (idx <= 0) continue;
			const k = decl.slice(0, idx).trim();
			const v = decl.slice(idx + 1).trim();
			if (k) out.set(k, v);
		}
		return out;
	}
	const NON_RENDERING = new Set([
		"defs",
		"linearGradient",
		"radialGradient",
		"clipPath",
		"mask",
		"pattern",
		"symbol",
		"style",
		"title",
		"desc",
		"metadata"
	]);
	function parseElement$1(el, inheritedIn, ctx) {
		if (el.localName === "use") return parseUse(el, inheritedIn, ctx);
		const inherited = applyAttrs(el, inheritedIn, ctx);
		const id = el.getAttribute("id");
		const transform = parseTransform(el.getAttribute("transform"), ctx.warnings);
		const opacity = parseDouble(el.getAttribute("opacity")) ?? 1;
		const styleMap = parseStyleAttr(el.getAttribute("style"));
		const clipPath = resolveClipPath(el.getAttribute("clip-path") ?? styleMap.get("clip-path") ?? lookupClassValue(el.getAttribute("class"), ctx.classRules, "clip-path") ?? null, ctx);
		let pathGeom = null;
		switch (el.localName) {
			case "svg":
			case "g": break;
			case "rect":
				pathGeom = parseRect(el);
				break;
			case "circle":
				pathGeom = parseCircle(el);
				break;
			case "ellipse":
				pathGeom = parseEllipse(el);
				break;
			case "line":
				pathGeom = parseLine(el);
				break;
			case "polygon":
				pathGeom = parsePoly(el, true);
				break;
			case "polyline":
				pathGeom = parsePoly(el, false);
				break;
			case "path": {
				const d = el.getAttribute("d");
				if (d) pathGeom = parseSvgPath(d, ctx.warnings);
				break;
			}
			case "text":
			case "image":
				ctx.warnings.push(`<${el.localName}> is not supported; skipping`);
				break;
			default: if (!NON_RENDERING.has(el.localName)) ctx.warnings.push(`unknown SVG element <${el.localName}>; skipping`);
		}
		const children = [];
		for (const child of el.children) {
			if (NON_RENDERING.has(child.localName)) continue;
			children.push(parseElement$1(child, inherited, ctx));
		}
		const hasFill = pathGeom !== null;
		return {
			id: id ?? null,
			tagName: el.localName,
			geometry: pathGeom?.path ?? null,
			geometryBounds: pathGeom?.bounds ?? null,
			geometryLength: pathGeom?.length ?? 0,
			geometryClosed: pathGeom?.closed ?? false,
			fill: hasFill ? withPaintOpacity(inherited.fill, inherited.fillOpacity) : null,
			stroke: hasFill ? withPaintOpacity(inherited.stroke, inherited.strokeOpacity) : null,
			strokeWidth: inherited.strokeWidth,
			strokeLinecap: inherited.strokeLinecap,
			strokeLinejoin: inherited.strokeLinejoin,
			strokeDashArray: inherited.strokeDashArray,
			strokeDashOffset: inherited.strokeDashOffset,
			transform,
			opacity,
			clipPath,
			children
		};
	}
	function parseUse(el, inheritedIn, ctx) {
		const href = el.getAttribute("href") ?? el.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? findAttrByLocalName(el, "href");
		const useX = parseDouble(el.getAttribute("x")) ?? 0;
		const useY = parseDouble(el.getAttribute("y")) ?? 0;
		let transform = parseTransform(el.getAttribute("transform"), ctx.warnings);
		if (useX !== 0 || useY !== 0) {
			const translate = [
				1,
				0,
				0,
				1,
				useX,
				useY
			];
			transform = transform ? multiplyMatrices(transform, translate) : translate;
		}
		if (transform && isIdentity(transform)) transform = null;
		const inherited = applyAttrs(el, inheritedIn, ctx);
		const opacity = parseDouble(el.getAttribute("opacity")) ?? 1;
		let resolved = null;
		if (href && href.startsWith("#")) {
			const target = ctx.idIndex.get(href.slice(1));
			if (target) resolved = parseElement$1(target, inherited, ctx);
			else ctx.warnings.push(`<use> references unknown id "${href.slice(1)}"`);
		} else ctx.warnings.push("<use> without \"#...\" href; skipping");
		return {
			id: el.getAttribute("id") ?? null,
			tagName: "use",
			geometry: null,
			geometryBounds: null,
			geometryLength: 0,
			geometryClosed: false,
			fill: null,
			stroke: null,
			strokeWidth: 1,
			strokeLinecap: "butt",
			strokeLinejoin: "miter",
			strokeDashArray: [],
			strokeDashOffset: 0,
			transform,
			opacity,
			clipPath: null,
			children: resolved ? [resolved] : []
		};
	}
	function findAttrByLocalName(el, name) {
		for (let i = 0; i < el.attributes.length; i++) {
			const a = el.attributes.item(i);
			if (a && a.localName === name) return a.value;
		}
		return null;
	}
	const URL_REF_RE = /url\(\s*#([^)\s]+)\s*\)/;
	function parsePaintReference(raw, ctx) {
		const s = raw.trim();
		const urlMatch = URL_REF_RE.exec(s);
		if (urlMatch) {
			const id = urlMatch[1];
			const target = ctx.idIndex.get(id);
			if (!target) {
				ctx.warnings.push(`unresolved paint reference url(#${id})`);
				return null;
			}
			switch (target.localName) {
				case "linearGradient": return parseLinearGradient(target, ctx);
				case "radialGradient": return parseRadialGradient(target, ctx);
				default:
					ctx.warnings.push(`url(#${id}) points to <${target.localName}>, not a gradient`);
					return null;
			}
		}
		const argb = parseColorToArgb(s, ctx.warnings);
		return argb !== null ? {
			kind: "solid",
			argb
		} : null;
	}
	/** Resolves gradient attribute inheritance through an href chain. */
	function resolveGradientChain(el, ctx, visited = /* @__PURE__ */ new Set()) {
		const id = el.getAttribute("id") ?? String(el);
		if (visited.has(id)) return {
			attrs: /* @__PURE__ */ new Map(),
			stops: []
		};
		visited.add(id);
		const attrs = /* @__PURE__ */ new Map();
		for (let i = 0; i < el.attributes.length; i++) {
			const a = el.attributes.item(i);
			if (a) attrs.set(a.localName, a.value);
		}
		const stops = Array.from(el.children).filter((c) => c.localName === "stop");
		const href = attrs.get("href") ?? el.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? null;
		if (href && href.startsWith("#")) {
			const target = ctx.idIndex.get(href.slice(1));
			if (target) {
				const parent = resolveGradientChain(target, ctx, visited);
				return {
					attrs: new Map([...parent.attrs, ...attrs]),
					stops: stops.length > 0 ? stops : parent.stops
				};
			}
		}
		return {
			attrs,
			stops
		};
	}
	function parseLinearGradient(el, ctx) {
		const { attrs, stops: stopEls } = resolveGradientChain(el, ctx);
		const x1 = parseLengthOrPercent(attrs.get("x1") ?? null) ?? 0;
		const y1 = parseLengthOrPercent(attrs.get("y1") ?? null) ?? 0;
		const x2 = parseLengthOrPercent(attrs.get("x2") ?? null) ?? 1;
		const y2 = parseLengthOrPercent(attrs.get("y2") ?? null) ?? 0;
		const objectBoundingBox = (attrs.get("gradientUnits") ?? "objectBoundingBox") === "objectBoundingBox";
		const spreadMethod = parseSpreadMethod(attrs.get("spreadMethod") ?? null);
		const gradientTransform = parseTransform(attrs.get("gradientTransform") ?? null, ctx.warnings);
		const { colors, stops } = parseStops(stopEls, ctx);
		return {
			kind: "linearGradient",
			x1,
			y1,
			x2,
			y2,
			colors,
			stops,
			spreadMethod,
			objectBoundingBox,
			gradientTransform
		};
	}
	function parseRadialGradient(el, ctx) {
		const { attrs, stops: stopEls } = resolveGradientChain(el, ctx);
		const cx = parseLengthOrPercent(attrs.get("cx") ?? null) ?? .5;
		const cy = parseLengthOrPercent(attrs.get("cy") ?? null) ?? .5;
		const r = parseLengthOrPercent(attrs.get("r") ?? null) ?? .5;
		const fxRaw = parseLengthOrPercent(attrs.get("fx") ?? null);
		const fyRaw = parseLengthOrPercent(attrs.get("fy") ?? null);
		const fx = fxRaw !== null ? fxRaw : null;
		const fy = fyRaw !== null ? fyRaw : null;
		const objectBoundingBox = (attrs.get("gradientUnits") ?? "objectBoundingBox") === "objectBoundingBox";
		const spreadMethod = parseSpreadMethod(attrs.get("spreadMethod") ?? null);
		const gradientTransform = parseTransform(attrs.get("gradientTransform") ?? null, ctx.warnings);
		const { colors, stops } = parseStops(stopEls, ctx);
		return {
			kind: "radialGradient",
			cx,
			cy,
			r,
			fx,
			fy,
			colors,
			stops,
			spreadMethod,
			objectBoundingBox,
			gradientTransform
		};
	}
	function parseStops(stopEls, ctx) {
		const colors = [];
		const stops = [];
		for (const s of stopEls) {
			const style = parseStyleAttr(s.getAttribute("style"));
			const classAttr = s.getAttribute("class");
			const offset = parseLengthOrPercent(s.getAttribute("offset")) ?? 0;
			const colorRaw = s.getAttribute("stop-color") ?? style.get("stop-color") ?? lookupClassValue(classAttr, ctx.classRules, "stop-color") ?? "black";
			const opacityRaw = s.getAttribute("stop-opacity") ?? style.get("stop-opacity") ?? lookupClassValue(classAttr, ctx.classRules, "stop-opacity") ?? null;
			const baseArgb = parseColorToArgb(colorRaw, ctx.warnings) ?? 4278190080;
			const opacity = opacityRaw !== null ? parseDouble(opacityRaw) ?? 1 : 1;
			colors.push(withArgbOpacity(baseArgb, opacity));
			stops.push(Math.max(0, Math.min(1, offset)));
		}
		if (colors.length === 0) return {
			colors: [0, 0],
			stops: [0, 1]
		};
		if (colors.length === 1) return {
			colors: [colors[0], colors[0]],
			stops: [stops[0] ?? 0, 1]
		};
		for (let i = 1; i < stops.length; i++) if (stops[i] < stops[i - 1]) stops[i] = stops[i - 1];
		return {
			colors,
			stops
		};
	}
	function parseSpreadMethod(raw) {
		if (raw === "reflect") return "reflect";
		if (raw === "repeat") return "repeat";
		return "pad";
	}
	function resolveClipPath(raw, ctx) {
		if (!raw) return null;
		const match = URL_REF_RE.exec(raw);
		if (!match) return null;
		const id = match[1];
		const target = ctx.idIndex.get(id);
		if (!target) {
			ctx.warnings.push(`unresolved clip-path reference url(#${id})`);
			return null;
		}
		if (target.localName !== "clipPath") {
			ctx.warnings.push(`url(#${id}) referenced from clip-path is not a <clipPath>`);
			return null;
		}
		const out = new Path2D();
		for (const child of target.children) accumulateClipGeometry(parseElement$1(child, INHERITED_INITIAL, ctx), out, IDENTITY);
		return out;
	}
	function accumulateClipGeometry(node, out, parentTransform) {
		const combined = node.transform ? multiplyMatrices(parentTransform, node.transform) : parentTransform;
		if (node.geometry) if (isIdentity(combined)) out.addPath(node.geometry);
		else out.addPath(node.geometry, {
			a: combined[0],
			b: combined[1],
			c: combined[2],
			d: combined[3],
			e: combined[4],
			f: combined[5]
		});
		for (const child of node.children) accumulateClipGeometry(child, out, combined);
	}
	function parseRect(el) {
		const x = parseDouble(el.getAttribute("x")) ?? 0;
		const y = parseDouble(el.getAttribute("y")) ?? 0;
		const w = parseDouble(el.getAttribute("width")) ?? 0;
		const h = parseDouble(el.getAttribute("height")) ?? 0;
		const rxRaw = parseDouble(el.getAttribute("rx"));
		const ryRaw = parseDouble(el.getAttribute("ry"));
		return makeRectPath(x, y, w, h, rxRaw ?? ryRaw ?? 0, ryRaw ?? rxRaw ?? 0);
	}
	function parseCircle(el) {
		return makeCirclePath(parseDouble(el.getAttribute("cx")) ?? 0, parseDouble(el.getAttribute("cy")) ?? 0, parseDouble(el.getAttribute("r")) ?? 0);
	}
	function parseEllipse(el) {
		return makeEllipsePath(parseDouble(el.getAttribute("cx")) ?? 0, parseDouble(el.getAttribute("cy")) ?? 0, parseDouble(el.getAttribute("rx")) ?? 0, parseDouble(el.getAttribute("ry")) ?? 0);
	}
	function parseLine(el) {
		return makeLinePath(parseDouble(el.getAttribute("x1")) ?? 0, parseDouble(el.getAttribute("y1")) ?? 0, parseDouble(el.getAttribute("x2")) ?? 0, parseDouble(el.getAttribute("y2")) ?? 0);
	}
	function parsePoly(el, close) {
		return makePolyPath(el.getAttribute("points") ?? "", close);
	}
	const TRANSFORM_RE = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
	function parseTransform(raw, warnings) {
		if (!raw || !raw.trim()) return null;
		let result = IDENTITY;
		let m;
		TRANSFORM_RE.lastIndex = 0;
		while ((m = TRANSFORM_RE.exec(raw)) !== null) {
			const op = m[1];
			const args = parseNumberList(m[2]);
			let mat;
			switch (op) {
				case "matrix":
					if (args.length === 6) mat = [
						args[0],
						args[1],
						args[2],
						args[3],
						args[4],
						args[5]
					];
					else {
						warnings.push(`matrix() transform requires 6 args, got ${args.length}`);
						continue;
					}
					break;
				case "translate":
					mat = [
						1,
						0,
						0,
						1,
						args[0] ?? 0,
						args[1] ?? 0
					];
					break;
				case "scale": {
					const sx = args[0] ?? 1;
					mat = [
						sx,
						0,
						0,
						args[1] ?? sx,
						0,
						0
					];
					break;
				}
				case "rotate": {
					const a = (args[0] ?? 0) * Math.PI / 180;
					const cos = Math.cos(a);
					const sin = Math.sin(a);
					if (args.length >= 3) {
						const cx = args[1], cy = args[2];
						const rot = [
							cos,
							sin,
							-sin,
							cos,
							0,
							0
						];
						const t1 = [
							1,
							0,
							0,
							1,
							cx,
							cy
						];
						const t2 = [
							1,
							0,
							0,
							1,
							-cx,
							-cy
						];
						mat = multiplyMatrices(multiplyMatrices(t1, rot), t2);
					} else mat = [
						cos,
						sin,
						-sin,
						cos,
						0,
						0
					];
					break;
				}
				case "skewX": {
					const a = (args[0] ?? 0) * Math.PI / 180;
					mat = [
						1,
						0,
						Math.tan(a),
						1,
						0,
						0
					];
					break;
				}
				case "skewY": {
					const a = (args[0] ?? 0) * Math.PI / 180;
					mat = [
						1,
						Math.tan(a),
						0,
						1,
						0,
						0
					];
					break;
				}
				default:
					warnings.push(`unknown transform op: ${op}`);
					continue;
			}
			result = isIdentity(result) ? mat : multiplyMatrices(result, mat);
		}
		return isIdentity(result) ? null : result;
	}
	const NAMED_COLORS = {
		black: 4278190080,
		white: 4294967295,
		red: 4294901760,
		green: 4278222848,
		blue: 4278190335,
		yellow: 4294967040,
		cyan: 4278255615,
		magenta: 4294902015,
		gray: 4286611584,
		grey: 4286611584,
		silver: 4290822336,
		maroon: 4286578688,
		olive: 4286611456,
		lime: 4278255360,
		aqua: 4278255615,
		teal: 4278222976,
		navy: 4278190208,
		fuchsia: 4294902015,
		purple: 4286578816,
		orange: 4294944e3,
		pink: 4294951115,
		brown: 4289014314,
		tan: 4291998860,
		gold: 4294956800,
		coral: 4294934352,
		salmon: 4294606962,
		khaki: 4293977740,
		indigo: 4283105410,
		violet: 4293821166
	};
	function parseColorToArgb(raw, warnings) {
		const s = raw.trim().toLowerCase();
		if (!s || s === "none" || s === "transparent") return null;
		if (s.startsWith("#")) {
			const hex = s.slice(1);
			if (hex.length === 3) {
				const r = parseInt(hex[0] + hex[0], 16);
				const g = parseInt(hex[1] + hex[1], 16);
				const b = parseInt(hex[2] + hex[2], 16);
				return (255 << 24 | r << 16 | g << 8 | b) >>> 0;
			}
			if (hex.length === 6) return (255 << 24 | parseInt(hex, 16)) >>> 0;
			if (hex.length === 8) {
				const r = parseInt(hex.slice(0, 2), 16);
				const g = parseInt(hex.slice(2, 4), 16);
				const b = parseInt(hex.slice(4, 6), 16);
				return (parseInt(hex.slice(6, 8), 16) << 24 | r << 16 | g << 8 | b) >>> 0;
			}
		}
		if (s.startsWith("rgb")) {
			const nums = parseNumberList(s);
			if (nums.length >= 3) {
				const r = clamp(Math.round(nums[0]), 0, 255);
				const g = clamp(Math.round(nums[1]), 0, 255);
				const b = clamp(Math.round(nums[2]), 0, 255);
				return ((nums.length >= 4 ? clamp(Math.round(nums[3] * 255), 0, 255) : 255) << 24 | r << 16 | g << 8 | b) >>> 0;
			}
		}
		const named = NAMED_COLORS[s];
		if (named !== void 0) return named;
		warnings.push(`unrecognised color "${raw}"; treating as transparent`);
		return null;
	}
	/** Folds an inherited opacity multiplier into a paint source's alpha. */
	function withPaintOpacity(paint, opacity) {
		if (!paint || opacity >= 1) return paint;
		switch (paint.kind) {
			case "solid": return {
				kind: "solid",
				argb: withArgbOpacity(paint.argb, opacity)
			};
			case "linearGradient": return {
				...paint,
				colors: paint.colors.map((c) => withArgbOpacity(c, opacity))
			};
			case "radialGradient": return {
				...paint,
				colors: paint.colors.map((c) => withArgbOpacity(c, opacity))
			};
		}
	}
	function withArgbOpacity(argb, opacity) {
		if (opacity >= 1) return argb;
		const a = argb >>> 24 & 255;
		return (Math.round(a * opacity) << 24 | argb & 16777215) >>> 0;
	}
	function parseDouble(s) {
		if (!s) return null;
		const t = s.trim().replace(/(?:px|pt|em|rem)$/, "");
		if (!t) return null;
		const n = parseFloat(t);
		return isNaN(n) ? null : n;
	}
	function parseLengthOrPercent(s) {
		if (!s) return null;
		const t = s.trim();
		if (t.endsWith("%")) {
			const v = parseFloat(t.slice(0, -1));
			return isNaN(v) ? null : v / 100;
		}
		return parseDouble(t);
	}
	function clamp(v, lo, hi) {
		return v < lo ? lo : v > hi ? hi : v;
	}

//#endregion
//#region src/loader/css-color.ts
/**
	* Parses a CSS color string into a 32-bit ARGB integer.
	*
	* Supported formats: #RGB, #RRGGBB, #RRGGBBAA.
	* Returns null for null, empty, "none", "transparent", or unrecognised values.
	*/
	function parseCssColorToArgb(raw) {
		if (raw == null) return null;
		const s = raw.trim().toLowerCase();
		if (s === "" || s === "none" || s === "transparent") return null;
		if (s.startsWith("#")) {
			const hex = s.slice(1);
			if (hex.length === 3) {
				const r = parseInt(hex[0] + hex[0], 16);
				const g = parseInt(hex[1] + hex[1], 16);
				const b = parseInt(hex[2] + hex[2], 16);
				return (255 << 24 | r << 16 | g << 8 | b) >>> 0;
			}
			if (hex.length === 6) return (255 << 24 | parseInt(hex, 16)) >>> 0;
			if (hex.length === 8) {
				const r = parseInt(hex.slice(0, 2), 16);
				const g = parseInt(hex.slice(2, 4), 16);
				const b = parseInt(hex.slice(4, 6), 16);
				return (parseInt(hex.slice(6, 8), 16) << 24 | r << 16 | g << 8 | b) >>> 0;
			}
		}
		return null;
	}
	/** Converts an ARGB integer to a CSS rgba() string. */
	function argbToCss(argb) {
		const a = argb >>> 24 & 255;
		return `rgba(${argb >>> 16 & 255},${argb >>> 8 & 255},${argb & 255},${(a / 255).toFixed(3)})`;
	}

//#endregion
//#region src/loader/parser.ts
/**
	* Parses a decoded .var.json object into a VectorAnimation.
	* Unknown keys are silently ignored.
	*/
	function parseVarJson(raw) {
		if (typeof raw === "string") raw = JSON.parse(raw);
		if (raw == null || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("expected a JSON object");
		const json = raw;
		const warnings = [];
		const svgRaw = str(json["svgRaw"]) ?? "";
		if (!svgRaw) warnings.push("missing or empty svgRaw");
		const states = strArray(json["states"]);
		const defaultState = str(json["defaultState"]) ?? states[0] ?? "";
		const stateConfigs = {};
		const rawConfigs = json["stateConfigs"];
		if (isObj(rawConfigs)) {
			for (const [k, v] of Object.entries(rawConfigs)) if (isObj(v)) stateConfigs[k] = parseStateConfig(v);
		}
		const defaultTransition = parseDefaultTransition(json["defaultTransition"]);
		const stateTransitions = [];
		const rawTransitions = json["stateTransitions"];
		if (Array.isArray(rawTransitions)) for (const t of rawTransitions) {
			if (!isObj(t)) continue;
			const from = str(t["from"]);
			const to = str(t["to"]);
			if (!from || !to) {
				warnings.push("stateTransition missing from/to; skipped");
				continue;
			}
			const overrides = {};
			const rawEls = t["elements"];
			if (isObj(rawEls)) {
				for (const [k, v] of Object.entries(rawEls)) if (isObj(v)) overrides[k] = {
					delay: num(v["delay"]) ?? 0,
					duration: num(v["duration"]) ?? null,
					curve: parseEasingCurve(v["curve"]) ?? null
				};
			}
			stateTransitions.push({
				from,
				to,
				duration: num(t["duration"]) ?? defaultTransition.duration,
				curve: parseEasingCurve(t["curve"]) ?? "ease-in-out",
				elements: overrides
			});
		}
		const elements = {};
		const rawElements = json["elements"];
		if (isObj(rawElements)) {
			for (const [k, v] of Object.entries(rawElements)) if (isObj(v)) elements[k] = parseElement(k, v, warnings);
		}
		const elementOrder = strArray(json["elementOrder"]);
		const svgResult = svgRaw ? parseSvg(svgRaw) : null;
		if (svgResult) warnings.push(...svgResult.warnings);
		const scene = svgResult?.root ?? {
			id: null,
			tagName: "svg",
			geometry: null,
			geometryBounds: null,
			geometryLength: 0,
			geometryClosed: false,
			fill: null,
			stroke: null,
			strokeWidth: 1,
			strokeLinecap: "butt",
			strokeLinejoin: "miter",
			strokeDashArray: [],
			strokeDashOffset: 0,
			transform: null,
			opacity: 1,
			clipPath: null,
			children: []
		};
		return {
			name: str(json["name"]) ?? "",
			fps: Math.round(num(json["fps"]) ?? 60),
			svgRaw,
			viewport: parseViewport(json["viewport"], warnings),
			states,
			defaultState,
			stateConfigs,
			stateTransitions,
			defaultTransition,
			elements,
			elementOrder: elementOrder.length > 0 ? elementOrder : Object.keys(elements),
			runtimeHints: parseRuntimeHints(json["runtimeHints"]),
			scene,
			sceneIndex: svgResult?.sceneIndex ?? /* @__PURE__ */ new Map(),
			warnings
		};
	}
	function parseRuntimeHints(raw) {
		if (!isObj(raw)) return null;
		return {
			warmUp: bool(raw["warmUp"]) ?? true,
			preSampledKeyframes: bool(raw["preSampledKeyframes"]) ?? false,
			sampleRate: num(raw["sampleRate"]) ?? null,
			preTessellated: bool(raw["preTessellated"]) ?? false,
			tessellationFlatness: num(raw["tessellationFlatness"]) ?? null
		};
	}
	function parseViewport(raw, warnings) {
		if (!isObj(raw)) {
			warnings.push("missing viewport; using defaults");
			return {
				x: 0,
				y: 0,
				width: 0,
				height: 0,
				backgroundArgb: null
			};
		}
		return {
			x: num(raw["x"]) ?? 0,
			y: num(raw["y"]) ?? 0,
			width: num(raw["width"]) ?? 0,
			height: num(raw["height"]) ?? 0,
			backgroundArgb: parseCssColorToArgb(str(raw["background"]))
		};
	}
	function parseStateConfig(v) {
		const duration = num(v["duration"]) ?? 2e3;
		return {
			duration,
			windowIn: num(v["windowIn"]) ?? 0,
			windowOut: num(v["windowOut"]) ?? duration,
			transitionIn: parseTransitionIn(v["transitionIn"])
		};
	}
	function parseTransitionIn(raw) {
		if (!isObj(raw)) return {
			type: "animate",
			duration: 300
		};
		return {
			type: str(raw["type"]) === "fade" ? "fade" : "animate",
			duration: num(raw["duration"]) ?? 300
		};
	}
	function parseDefaultTransition(raw) {
		if (!isObj(raw)) return {
			duration: 300,
			curve: "ease-in-out"
		};
		return {
			duration: num(raw["duration"]) ?? 300,
			curve: parseEasingCurve(raw["curve"]) ?? "ease-in-out"
		};
	}
	function parseElement(id, raw, warnings) {
		const animations = {};
		const rawAnims = raw["animations"];
		if (isObj(rawAnims)) for (const [stateName, v] of Object.entries(rawAnims)) {
			if (!isObj(v)) continue;
			const rawKfs = v["keyframes"];
			if (!Array.isArray(rawKfs)) continue;
			const kfs = [];
			for (let i = 0; i < rawKfs.length; i++) {
				const kf = rawKfs[i];
				if (!isObj(kf)) continue;
				let props = null;
				const rawProps = kf["props"];
				if (Array.isArray(rawProps)) props = new Set(rawProps.filter((p) => typeof p === "string"));
				kfs.push({
					id: str(kf["id"]) ?? `${id}-${stateName}-${i}`,
					time: num(kf["time"]) ?? 0,
					x: num(kf["x"]) ?? 0,
					y: num(kf["y"]) ?? 0,
					rotation: num(kf["rotation"]) ?? 0,
					scaleX: num(kf["scaleX"]) ?? 1,
					scaleY: num(kf["scaleY"]) ?? 1,
					opacity: num(kf["opacity"]) ?? 1,
					zIndex: num(kf["zIndex"]) ?? null,
					pathProgress: num(kf["pathProgress"]) ?? null,
					strokeDashOffset: num(kf["strokeDashOffset"]) ?? null,
					hidden: bool(kf["hidden"]) ?? null,
					nodePositions: parseNodePositions(kf["nodePositions"]),
					curve: parseEasingCurve(kf["curve"]) ?? "linear",
					props
				});
			}
			kfs.sort((a, b) => a.time - b.time);
			animations[stateName] = { keyframes: kfs };
		}
		const dataBindings = [];
		const rawBindings = raw["dataBindings"];
		if (Array.isArray(rawBindings)) for (const b of rawBindings) {
			if (!isObj(b)) continue;
			const binding = parseBinding(id, b, warnings);
			if (binding) dataBindings.push(binding);
		}
		const poly = parsePolylines(raw["polylines"]);
		return {
			id,
			tagName: str(raw["tagName"]) ?? str(raw["type"]) ?? "",
			pivotX: num(raw["pivotX"]) ?? 0,
			pivotY: num(raw["pivotY"]) ?? 0,
			visible: raw["visible"] !== false,
			animations,
			dataBindings,
			clipMaskId: str(raw["clipMaskId"]) ?? null,
			polylinePath: poly.path,
			polylineLength: poly.length,
			polylineClosed: poly.closed
		};
	}
	function parsePolylines(raw) {
		if (!Array.isArray(raw) || raw.length === 0 || typeof Path2D === "undefined") return {
			path: null,
			length: 0,
			closed: false
		};
		const path = new Path2D();
		let totalLength = 0;
		let anyClosed = false;
		for (const c of raw) {
			if (!isObj(c)) continue;
			const points = c["points"];
			if (!Array.isArray(points) || points.length < 4) continue;
			const closed = bool(c["closed"]) ?? false;
			if (closed) anyClosed = true;
			let px = num(points[0]) ?? 0;
			let py = num(points[1]) ?? 0;
			path.moveTo(px, py);
			for (let i = 2; i < points.length - 1; i += 2) {
				const x = num(points[i]) ?? 0;
				const y = num(points[i + 1]) ?? 0;
				path.lineTo(x, y);
				totalLength += Math.hypot(x - px, y - py);
				px = x;
				py = y;
			}
			if (closed) path.closePath();
		}
		return {
			path,
			length: totalLength,
			closed: anyClosed
		};
	}
	function parseBinding(elementId, raw, warnings) {
		const propertyRaw = str(raw["property"]);
		const dataKey = str(raw["dataKey"]);
		if (!propertyRaw || !dataKey) {
			warnings.push(`data binding on "${elementId}" missing property or dataKey; skipped`);
			return null;
		}
		if (!isBoundProperty(propertyRaw)) {
			warnings.push(`data binding on "${elementId}" has unknown property "${propertyRaw}"; skipped`);
			return null;
		}
		return {
			id: str(raw["id"]) ?? `db_${elementId}_${propertyRaw}`,
			property: propertyRaw,
			dataKey,
			settlingMs: num(raw["settlingMs"]) ?? 300,
			curve: parseEasingCurve(raw["curve"]) ?? "linear",
			inMin: num(raw["inMin"]) ?? 0,
			inMax: num(raw["inMax"]) ?? 1,
			outMin: num(raw["outMin"]) ?? 0,
			outMax: num(raw["outMax"]) ?? 1,
			colorMinArgb: parseCssColorToArgb(str(raw["colorMin"])),
			colorMaxArgb: parseCssColorToArgb(str(raw["colorMax"]))
		};
	}
	function isObj(v) {
		return v !== null && typeof v === "object" && !Array.isArray(v);
	}
	function str(v) {
		return typeof v === "string" ? v : null;
	}
	function num(v) {
		if (typeof v === "number") return v;
		if (typeof v === "string") {
			const n = parseFloat(v);
			return isNaN(n) ? null : n;
		}
		return null;
	}
	function bool(v) {
		if (typeof v === "boolean") return v;
		return null;
	}
	function strArray(v) {
		if (!Array.isArray(v)) return [];
		return v.filter((x) => typeof x === "string");
	}
	/**
	* Parses a `nodePositions` keyframe channel from raw JSON.
	*
	* Returns null when the keyframe doesn't drive the path geometry. Iteration
	* order of the resulting Map matches the JSON object's insertion order, which
	* mirrors the editor's path traversal — required so the renderer can stream
	* entries straight into a `d` string.
	*/
	function parseNodePositions(v) {
		if (!isObj(v)) return null;
		const entries = Object.entries(v);
		if (entries.length === 0) return null;
		const out = /* @__PURE__ */ new Map();
		for (const [nodeId, raw] of entries) {
			if (!isObj(raw)) continue;
			const x = num(raw["x"]);
			const y = num(raw["y"]);
			if (x === null || y === null) continue;
			out.set(nodeId, {
				x,
				y,
				cpIn: parseCp(raw["cpIn"]),
				cpOut: parseCp(raw["cpOut"]),
				isMove: raw["isMove"] === true,
				close: raw["close"] === true
			});
		}
		return out.size > 0 ? out : null;
	}
	function parseCp(v) {
		if (!isObj(v)) return null;
		const x = num(v["x"]);
		const y = num(v["y"]);
		if (x === null || y === null) return null;
		return {
			x,
			y
		};
	}
	const EASING_CURVES = new Set([
		"linear",
		"ease-in",
		"ease-out",
		"ease-in-out",
		"ease-in-out-back",
		"step",
		"bounce-in",
		"bounce-out",
		"elastic-in",
		"elastic-out"
	]);
	function parseEasingCurve(v) {
		if (typeof v === "string" && EASING_CURVES.has(v)) return v;
		return null;
	}
	const BOUND_PROPERTIES = new Set([
		"x",
		"y",
		"rotation",
		"scaleX",
		"scaleY",
		"opacity",
		"fill",
		"stroke",
		"strokeDashOffset"
	]);
	function isBoundProperty(v) {
		return BOUND_PROPERTIES.has(v);
	}

//#endregion
//#region src/loader/loader.ts
/** Magic header bytes for binary .var files: ASCII "VAB" + 0x01. */
	const VAR_MAGIC = new Uint8Array([
		86,
		65,
		66,
		1
	]);
	/**
	* Loads and parses .var and .var.json animation files.
	*
	* Binary .var files use gzip compression prefixed with a 4-byte magic header
	* (VAB\x01). Decompression requires the native DecompressionStream API
	* (browsers, Node 18+).
	*/
	var VarLoader = class VarLoader {
		/**
		* Fetches a .var or .var.json file from a URL and parses it.
		* Auto-detects binary vs text format.
		*/
		static async fromUrl(url) {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`VarLoader.fromUrl: ${response.status} ${response.statusText} (${url})`);
			const bytes = new Uint8Array(await response.arrayBuffer());
			return VarLoader.fromBytes(bytes);
		}
		/**
		* Parses raw bytes — either a binary .var (gzip + magic header) or a
		* UTF-8 encoded .var.json.
		*/
		static async fromBytes(bytes) {
			if (isBinaryVar(bytes)) return parseVarJson(await gunzip(bytes.slice(VAR_MAGIC.length)));
			return parseVarJson(new TextDecoder().decode(bytes));
		}
		/**
		* Parses a pre-loaded .var.json string.
		* Synchronous — does not handle binary format.
		*/
		static fromJsonString(raw) {
			return parseVarJson(raw);
		}
		/**
		* Parses a pre-decoded JSON object.
		* Synchronous — does not handle binary format.
		*/
		static fromJson(obj) {
			return parseVarJson(obj);
		}
	};
	function isBinaryVar(bytes) {
		if (bytes.length < VAR_MAGIC.length) return false;
		for (let i = 0; i < VAR_MAGIC.length; i++) if (bytes[i] !== VAR_MAGIC[i]) return false;
		return true;
	}
	async function gunzip(compressed) {
		const ds = new DecompressionStream("gzip");
		const writer = ds.writable.getWriter();
		writer.write(compressed);
		writer.close();
		return new Response(ds.readable).text();
	}

//#endregion
//#region src/engine/easing.ts
/**
	* Applies a curve to normalised progress t in [0, 1].
	*
	* Curves match the JS authoring tool's interpolation.js. Input is clamped at
	* the boundaries; output may overshoot [0, 1] for back/bounce/elastic curves
	* by design — that's what produces the visual overshoot.
	*/
	function applyEasing(curve, t) {
		if (t <= 0) return 0;
		if (t >= 1) return 1;
		switch (curve) {
			case "linear": return t;
			case "ease-in": return t * t * t;
			case "ease-out": {
				const u = 1 - t;
				return 1 - u * u * u;
			}
			case "ease-in-out": return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
			case "ease-in-out-back": {
				const c2 = 1.70158 * 1.525;
				return t < .5 ? Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
			}
			case "step": return t < 1 ? 0 : 1;
			case "bounce-out": return bounceOut(t);
			case "bounce-in": return 1 - bounceOut(1 - t);
			case "elastic-out": {
				const c4 = 2 * Math.PI / 3;
				return Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * c4) + 1;
			}
			case "elastic-in": {
				const c4 = 2 * Math.PI / 3;
				return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
			}
		}
	}
	function bounceOut(t) {
		const n1 = 7.5625;
		const d1 = 2.75;
		if (t < 1 / d1) return n1 * t * t;
		else if (t < 2 / d1) {
			const u = t - 1.5 / d1;
			return n1 * u * u + .75;
		} else if (t < 2.5 / d1) {
			const u = t - 2.25 / d1;
			return n1 * u * u + .9375;
		} else {
			const u = t - 2.625 / d1;
			return n1 * u * u + .984375;
		}
	}
	function lerp(a, b, t) {
		return a + (b - a) * t;
	}
	/**
	* Shortest-path linear interpolation of angles in degrees. Prevents the
	* long-way-around behaviour when crossing the ±180° boundary.
	*/
	function lerpAngleDeg(a, b, t) {
		return a + (((b - a) % 360 + 540) % 360 - 180) * t;
	}
	/**
	* Lerps two nullable channel values. If either side is null, the non-null
	* value is returned (no fade in/out). If both are null, returns null.
	*/
	function lerpNullable(a, b, t) {
		if (a === null && b === null) return null;
		if (a === null) return b;
		if (b === null) return a;
		return lerp(a, b, t);
	}

//#endregion
//#region src/engine/property-resolver.ts
/** Static identity pose — used when an element has no keyframes in a state. */
	function identityResolved(el) {
		return {
			x: 0,
			y: 0,
			rotation: 0,
			scaleX: 1,
			scaleY: 1,
			opacity: 1,
			zIndex: null,
			pathProgress: null,
			pivotX: el.pivotX,
			pivotY: el.pivotY,
			fillOverride: null,
			strokeOverride: null,
			strokeDashOffset: null,
			hidden: null,
			nodePositions: null
		};
	}
	/** Pose that exactly matches a single keyframe's values. */
	function resolvedFromKeyframe(kf, el) {
		return {
			x: kf.x,
			y: kf.y,
			rotation: kf.rotation,
			scaleX: kf.scaleX,
			scaleY: kf.scaleY,
			opacity: kf.opacity,
			zIndex: kf.zIndex,
			pathProgress: kf.pathProgress,
			pivotX: el.pivotX,
			pivotY: el.pivotY,
			fillOverride: null,
			strokeOverride: null,
			strokeDashOffset: kf.strokeDashOffset,
			hidden: kf.hidden ?? null,
			nodePositions: kf.nodePositions
		};
	}
	/**
	* Resolves [el]'s animated values at [localTimeMs] within [stateName].
	*
	* When any keyframe carries a `props` declaration, per-channel interpolation
	* is used: each property finds its own bracketing keyframes that declare it.
	* Legacy keyframes (props == null) declare all channels, preserving
	* backwards-compatible behaviour.
	*/
	function resolveElement(el, stateName, localTimeMs) {
		const anim = el.animations[stateName];
		if (!anim || anim.keyframes.length === 0) return identityResolved(el);
		const kfs = anim.keyframes;
		if (kfs.length === 1) return resolvedFromKeyframe(kfs[0], el);
		if (!kfs.some((k) => k.props !== null)) {
			if (localTimeMs <= kfs[0].time) return resolvedFromKeyframe(kfs[0], el);
			if (localTimeMs >= kfs[kfs.length - 1].time) return resolvedFromKeyframe(kfs[kfs.length - 1], el);
			return resolveAllChannels(kfs, localTimeMs, el);
		}
		return resolvePerChannel(kfs, localTimeMs, el);
	}
	function resolveAllChannels(kfs, t, el) {
		let lo = 0;
		let hi = kfs.length - 1;
		while (lo < hi - 1) {
			const mid = lo + hi >> 1;
			if (kfs[mid].time <= t) lo = mid;
			else hi = mid;
		}
		const a = kfs[lo];
		const b = kfs[hi];
		const span = b.time - a.time;
		const frac = span <= 0 ? 1 : (t - a.time) / span;
		const eased = applyEasing(b.curve, frac);
		let hidden = null;
		for (const kf of kfs) {
			if (kf.hidden == null) continue;
			if (kf.time <= t) hidden = kf.hidden;
			else break;
		}
		return {
			x: lerp(a.x, b.x, eased),
			y: lerp(a.y, b.y, eased),
			rotation: lerp(a.rotation, b.rotation, eased),
			scaleX: lerp(a.scaleX, b.scaleX, eased),
			scaleY: lerp(a.scaleY, b.scaleY, eased),
			opacity: lerp(a.opacity, b.opacity, eased),
			zIndex: lerpNullable(a.zIndex, b.zIndex, eased),
			pathProgress: lerpNullable(a.pathProgress, b.pathProgress, eased),
			pivotX: el.pivotX,
			pivotY: el.pivotY,
			fillOverride: null,
			strokeOverride: null,
			strokeDashOffset: lerpNullable(a.strokeDashOffset, b.strokeDashOffset, eased),
			hidden,
			nodePositions: resolveNodePositions(kfs, t)
		};
	}
	function resolvePerChannel(kfs, t, el) {
		return {
			x: resolveChannel(kfs, t, "x", (kf) => kf.x, 0, false),
			y: resolveChannel(kfs, t, "y", (kf) => kf.y, 0, false),
			rotation: resolveChannel(kfs, t, "rotation", (kf) => kf.rotation, 0, false),
			scaleX: resolveChannel(kfs, t, "scaleX", (kf) => kf.scaleX, 1, false),
			scaleY: resolveChannel(kfs, t, "scaleY", (kf) => kf.scaleY, 1, false),
			opacity: resolveChannel(kfs, t, "opacity", (kf) => kf.opacity, 1, false),
			zIndex: resolveNullableChannel(kfs, t, "zIndex", (kf) => kf.zIndex),
			pathProgress: resolveNullableChannel(kfs, t, "pathProgress", (kf) => kf.pathProgress),
			strokeDashOffset: resolveNullableChannel(kfs, t, "strokeDashOffset", (kf) => kf.strokeDashOffset),
			hidden: resolveStepBoolChannel(kfs, t, "hidden", (kf) => kf.hidden),
			pivotX: el.pivotX,
			pivotY: el.pivotY,
			fillOverride: null,
			strokeOverride: null,
			nodePositions: resolveNodePositions(kfs, t)
		};
	}
	/** Find bracketing kfs that drive `nodePositions` and interpolate per anchor.
	*  Mirrors the editor's `interpolateNodePositions`: lerp x/y/cpIn/cpOut, hold
	*  isMove/close from the lo node. Iteration order of the result follows the
	*  lo keyframe's Map order (keys absent from lo fall through to hi's order). */
	function resolveNodePositions(kfs, t) {
		let lo = null;
		let hi = null;
		for (const kf of kfs) {
			if (!kf.nodePositions) continue;
			if (kf.time <= t) lo = kf;
			else {
				hi = kf;
				break;
			}
		}
		if (!lo && !hi) return null;
		if (!lo) return hi.nodePositions;
		if (!hi) return lo.nodePositions;
		const span = hi.time - lo.time;
		const frac = span <= 0 ? 1 : (t - lo.time) / span;
		const eased = applyEasing(hi.curve, frac);
		return lerpNodePositions(lo.nodePositions, hi.nodePositions, eased);
	}
	function lerpNodePositions(a, b, t) {
		const out = /* @__PURE__ */ new Map();
		for (const [key, na] of a) {
			const nb = b.get(key);
			out.set(key, nb ? blendNode(na, nb, t) : na);
		}
		for (const [key, nb] of b) if (!out.has(key)) out.set(key, nb);
		return out;
	}
	function blendNode(a, b, t) {
		return {
			x: lerp(a.x, b.x, t),
			y: lerp(a.y, b.y, t),
			cpIn: blendCp(a.cpIn, b.cpIn, t),
			cpOut: blendCp(a.cpOut, b.cpOut, t),
			isMove: a.isMove,
			close: a.close
		};
	}
	function blendCp(a, b, t) {
		if (!a && !b) return null;
		if (!a) return b;
		if (!b) return a;
		return {
			x: lerp(a.x, b.x, t),
			y: lerp(a.y, b.y, t)
		};
	}
	/** Step-hold resolver for boolean channels (e.g. hidden). Returns the last
	*  non-null value declared by a keyframe at or before t, or null if none. */
	function resolveStepBoolChannel(kfs, t, ch, get) {
		let val = null;
		for (const kf of kfs) {
			if (!declaresChannel(kf, ch)) continue;
			if (get(kf) == null) continue;
			if (kf.time <= t) val = get(kf);
			else break;
		}
		return val;
	}
	function declaresChannel(kf, ch) {
		return kf.props === null || kf.props.has(ch);
	}
	/** Resolves one required channel by finding the bracketing keyframes that declare it. */
	function resolveChannel(kfs, t, ch, get, identity, isAngle) {
		let lo = -1;
		for (let i = kfs.length - 1; i >= 0; i--) if (kfs[i].time <= t && declaresChannel(kfs[i], ch)) {
			lo = i;
			break;
		}
		let hi = -1;
		for (let i = 0; i < kfs.length; i++) if (kfs[i].time > t && declaresChannel(kfs[i], ch)) {
			hi = i;
			break;
		}
		if (lo === -1 && hi === -1) return identity;
		if (lo === -1) return get(kfs[hi]);
		if (hi === -1) return get(kfs[lo]);
		const a = kfs[lo];
		const b = kfs[hi];
		const span = b.time - a.time;
		const frac = span <= 0 ? 1 : (t - a.time) / span;
		const eased = applyEasing(b.curve, frac);
		return isAngle ? lerpAngleDeg(get(a), get(b), eased) : lerp(get(a), get(b), eased);
	}
	/** Resolves one optional channel (zIndex, pathProgress) — null values skipped. */
	function resolveNullableChannel(kfs, t, ch, get) {
		let lo = -1;
		for (let i = kfs.length - 1; i >= 0; i--) if (kfs[i].time <= t && declaresChannel(kfs[i], ch) && get(kfs[i]) !== null) {
			lo = i;
			break;
		}
		let hi = -1;
		for (let i = 0; i < kfs.length; i++) if (kfs[i].time > t && declaresChannel(kfs[i], ch) && get(kfs[i]) !== null) {
			hi = i;
			break;
		}
		if (lo === -1 && hi === -1) return null;
		if (lo === -1) return get(kfs[hi]);
		if (hi === -1) return get(kfs[lo]);
		const a = kfs[lo];
		const b = kfs[hi];
		const span = b.time - a.time;
		const frac = span <= 0 ? 1 : (t - a.time) / span;
		const eased = applyEasing(b.curve, frac);
		return lerp(get(a), get(b), eased);
	}
	/** Blends from → to by t in [0, 1]. Used during state transitions. */
	function blendResolved(from, to, t) {
		return {
			x: lerp(from.x, to.x, t),
			y: lerp(from.y, to.y, t),
			rotation: lerpAngleDeg(from.rotation, to.rotation, t),
			scaleX: lerp(from.scaleX, to.scaleX, t),
			scaleY: lerp(from.scaleY, to.scaleY, t),
			opacity: lerp(from.opacity, to.opacity, t),
			zIndex: lerpNullable(from.zIndex, to.zIndex, t),
			pathProgress: lerpNullable(from.pathProgress, to.pathProgress, t),
			pivotX: to.pivotX,
			pivotY: to.pivotY,
			fillOverride: to.fillOverride,
			strokeOverride: to.strokeOverride,
			strokeDashOffset: lerpNullable(from.strokeDashOffset, to.strokeDashOffset, t),
			hidden: to.hidden ?? from.hidden,
			nodePositions: t > 0 ? to.nodePositions ?? from.nodePositions : from.nodePositions ?? to.nodePositions
		};
	}

//#endregion
//#region src/engine/data-binding.ts
/** True for `fill` and `stroke` (color-typed bindings); false for scalars. */
	function isColorProperty(p) {
		return p === "fill" || p === "stroke";
	}
	/**
	* Maps an external scalar value through a binding's clamped linear mapping.
	*
	*   raw → clamp((raw - inMin) / (inMax - inMin), 0, 1) → outMin..outMax
	*/
	function mapScalar(b, raw) {
		const span = b.inMax - b.inMin;
		if (span === 0) return b.outMin;
		let t = (raw - b.inMin) / span;
		if (t < 0) t = 0;
		if (t > 1) t = 1;
		return b.outMin + (b.outMax - b.outMin) * t;
	}
	/**
	* Maps an external scalar value through a colour binding's ARGB lerp.
	* Null endpoints fall back to opaque black / opaque white.
	*/
	function mapColor(b, raw) {
		const span = b.inMax - b.inMin;
		const a = b.colorMinArgb ?? 4278190080;
		const z = b.colorMaxArgb ?? 4294967295;
		if (span === 0) return a;
		let t = (raw - b.inMin) / span;
		if (t < 0) t = 0;
		if (t > 1) t = 1;
		return argbLerp(a, z, t);
	}
	/** Component-wise lerp of two ARGB integers (alpha included). */
	function argbLerp(a, b, t) {
		const a1 = a >>> 24 & 255;
		const a2 = b >>> 24 & 255;
		const r1 = a >>> 16 & 255;
		const r2 = b >>> 16 & 255;
		const g1 = a >>> 8 & 255;
		const g2 = b >>> 8 & 255;
		const b1 = a & 255;
		const b2 = b & 255;
		const aa = Math.round(a1 + (a2 - a1) * t);
		const rr = Math.round(r1 + (r2 - r1) * t);
		const gg = Math.round(g1 + (g2 - g1) * t);
		const bb = Math.round(b1 + (b2 - b1) * t);
		return (aa << 24 | rr << 16 | gg << 8 | bb) >>> 0;
	}

//#endregion
//#region src/engine/controller.ts
/**
	* Mutable playback state for a [VectorAnimation].
	*
	* The controller does not own a clock — call [advance] once per frame with
	* the elapsed delta (typically from a `requestAnimationFrame` loop). After
	* each advance, listeners registered via [addListener] are notified so
	* downstream renderers can repaint.
	*/
	var VectorAnimateController = class {
		constructor(animation, options = {}) {
			this._direction = 1;
			this._wallClockMs = 0;
			this._inTransition = false;
			this._isFadeTransition = false;
			this._transitionElapsedMs = 0;
			this._transitionMaxDurationMs = 0;
			this._transitionFadeDurationMs = 0;
			this._activeTransition = null;
			this._snapshot = /* @__PURE__ */ new Map();
			this._transitionFromState = null;
			this._dataValues = /* @__PURE__ */ new Map();
			this._bindingState = /* @__PURE__ */ new Map();
			this._bindingDirty = false;
			this._listeners = /* @__PURE__ */ new Set();
			this._stateChangeHandlers = /* @__PURE__ */ new Set();
			this._stateTransitionEndHandlers = /* @__PURE__ */ new Set();
			this.animation = animation;
			this.mode = options.mode ?? "loop";
			this.speed = options.speed ?? 1;
			this._isPlaying = options.autoplay ?? true;
			let initial = options.initialState ?? animation.defaultState;
			if (!animation.states.includes(initial) && animation.states.length > 0) initial = animation.states[0];
			this._currentState = initial;
			this._stateTimeMs = animation.stateConfigs[initial]?.windowIn ?? 0;
		}
		get currentState() {
			return this._currentState;
		}
		get position() {
			return this._stateTimeMs;
		}
		get isPlaying() {
			return this._isPlaying;
		}
		get isInTransition() {
			return this._inTransition;
		}
		/** Global opacity for the fade-in effect when the active state's
		*  transitionIn type is `fade`. Returns 1.0 when no fade is in progress. */
		get transitionInFadeOpacity() {
			if (!this._inTransition || !this._isFadeTransition) return 1;
			if (this._transitionFadeDurationMs <= 0) return 1;
			const t = this._transitionElapsedMs / this._transitionFadeDurationMs;
			return t < 0 ? 0 : t > 1 ? 1 : t;
		}
		play() {
			if (this._isPlaying) return;
			this._isPlaying = true;
			this._notify();
		}
		pause() {
			if (!this._isPlaying) return;
			this._isPlaying = false;
			this._notify();
		}
		/** Pauses and rewinds the active state to its windowIn. */
		stop() {
			this._isPlaying = false;
			this._stateTimeMs = this.animation.stateConfigs[this._currentState]?.windowIn ?? 0;
			this._direction = 1;
			this._notify();
		}
		/** Jumps to [ms] within the active state, clamped to [windowIn, windowOut]. */
		seekTo(ms) {
			const cfg = this.animation.stateConfigs[this._currentState];
			let t = ms;
			if (cfg) {
				if (t < cfg.windowIn) t = cfg.windowIn;
				if (t > cfg.windowOut) t = cfg.windowOut;
			}
			this._stateTimeMs = t;
			this._notify();
		}
		/**
		* Switches to [targetState]. No-op when already in that state and not mid-
		* transition. Throws if [targetState] is not declared in the animation.
		* Fires `onStateChange` synchronously.
		*/
		setState(targetState) {
			if (!this.animation.states.includes(targetState)) throw new Error(`unknown state "${targetState}" (known: ${this.animation.states.join(", ")})`);
			if (targetState === this._currentState && !this._inTransition) return;
			this._snapshot = this.resolveAll();
			const from = this._currentState;
			this._currentState = targetState;
			this._stateTimeMs = this.animation.stateConfigs[targetState]?.windowIn ?? 0;
			this._direction = 1;
			this._transitionFromState = from;
			const transitionIn = this.animation.stateConfigs[targetState]?.transitionIn;
			this._isFadeTransition = transitionIn?.type === "fade";
			this._transitionFadeDurationMs = transitionIn?.duration ?? 300;
			if (this._isFadeTransition) {
				this._activeTransition = null;
				this._transitionMaxDurationMs = this._transitionFadeDurationMs;
			} else {
				this._activeTransition = findTransition(this.animation.stateTransitions, from, targetState);
				const globalDur = this._activeTransition?.duration ?? this.animation.defaultTransition.duration;
				let maxEnd = globalDur;
				if (this._activeTransition) for (const ov of Object.values(this._activeTransition.elements)) {
					const end = ov.delay + (ov.duration ?? globalDur);
					if (end > maxEnd) maxEnd = end;
				}
				this._transitionMaxDurationMs = maxEnd;
			}
			this._transitionElapsedMs = 0;
			this._inTransition = this._transitionMaxDurationMs > 0;
			this._fireStateChange({
				from,
				to: targetState
			});
			this._notify();
		}
		/**
		* Pushes an external value into the animation. Any binding whose `dataKey`
		* matches retargets toward the new value over its `settlingMs`. Settlement
		* continues even while playback is paused.
		*/
		setData(key, value) {
			this._setDataKey(key, value);
			this._bindingDirty = true;
			this._notify();
		}
		/** Bulk variant of [setData]; fires a single notification. */
		setDataMap(values) {
			let changed = false;
			for (const [k, v] of Object.entries(values)) {
				this._setDataKey(k, v);
				changed = true;
			}
			if (!changed) return;
			this._bindingDirty = true;
			this._notify();
		}
		/**
		* Removes the data value for [key] and discards any in-flight settle state
		* for bindings using it. Subsequent frames render those bindings as if no
		* external value had been set (i.e. keyframe values take over).
		*/
		clearData(key) {
			if (!this._dataValues.delete(key)) return;
			for (const el of Object.values(this.animation.elements)) for (const b of el.dataBindings) if (b.dataKey === key) this._bindingState.delete(b.id);
			this._bindingDirty = true;
			this._notify();
		}
		/** Returns the last value passed to [setData] for [key], or undefined. */
		getData(key) {
			return this._dataValues.get(key);
		}
		/** Iterable over all keys currently set via [setData] / [setDataMap]. */
		get dataKeys() {
			return this._dataValues.keys();
		}
		/** All `DataBinding.dataKey`s declared by the animation. */
		get declaredDataKeys() {
			const out = /* @__PURE__ */ new Set();
			for (const el of Object.values(this.animation.elements)) for (const b of el.dataBindings) out.add(b.dataKey);
			return out;
		}
		/**
		* Snapshot of every state declared by the animation. Result order matches
		* `animation.states`. Use this to populate state pickers, debug overlays,
		* or to discover which states have shorter playback windows.
		*/
		listStates() {
			const out = [];
			for (const name of this.animation.states) {
				const cfg = this.animation.stateConfigs[name];
				let elementCount = 0;
				for (const el of Object.values(this.animation.elements)) if (el.animations[name]) elementCount += 1;
				out.push({
					name,
					duration: cfg?.duration ?? 0,
					windowIn: cfg?.windowIn ?? 0,
					windowOut: cfg?.windowOut ?? 0,
					transitionInType: cfg?.transitionIn.type ?? "animate",
					transitionInDuration: cfg?.transitionIn.duration ?? 0,
					isDefault: name === this.animation.defaultState,
					isCurrent: name === this._currentState,
					elementCount
				});
			}
			return out;
		}
		/** Looks up a single state's metadata by name. Undefined if unknown. */
		getStateInfo(name) {
			return this.listStates().find((s) => s.name === name);
		}
		/**
		* Every `DataBinding` declared in the animation, decorated with the id of
		* the element that owns it. Result order matches `animation.elementOrder`,
		* then per-element `dataBindings` order.
		*/
		listBindings() {
			const out = [];
			for (const elementId of this.animation.elementOrder) {
				const el = this.animation.elements[elementId];
				if (!el) continue;
				for (const b of el.dataBindings) out.push(toBindingInfo(b, elementId));
			}
			return out;
		}
		/**
		* Every distinct `DataBinding.dataKey` declared in the animation, the
		* bindings that consume each key, and the controller's current value for
		* that key (if any). Order is first-seen during element iteration.
		*/
		listDataKeys() {
			const byKey = /* @__PURE__ */ new Map();
			for (const info of this.listBindings()) {
				let bucket = byKey.get(info.dataKey);
				if (!bucket) {
					bucket = [];
					byKey.set(info.dataKey, bucket);
				}
				bucket.push(info);
			}
			const out = [];
			for (const [dataKey, bindings] of byKey) {
				const currentValue = this._dataValues.get(dataKey);
				out.push({
					dataKey,
					bindings,
					currentValue,
					isSet: currentValue !== void 0
				});
			}
			return out;
		}
		_setDataKey(key, value) {
			const prev = this._dataValues.get(key);
			this._dataValues.set(key, value);
			for (const el of Object.values(this.animation.elements)) for (const b of el.dataBindings) {
				if (b.dataKey !== key) continue;
				const state = this._bindingState.get(b.id);
				if (state === void 0 || state.lastRaw !== value || prev === void 0) this._retargetBinding(b, value);
			}
		}
		_retargetBinding(b, raw) {
			const prev = this._bindingState.get(b.id);
			const current = prev !== void 0 ? this._evalBindingCurrent(b, prev) : this._evalBinding(b, raw);
			this._bindingState.set(b.id, {
				startValue: current,
				targetValue: this._evalBinding(b, raw),
				startTsMs: this._wallClockMs,
				settlingMs: b.settlingMs < 0 ? 0 : b.settlingMs,
				curve: b.curve,
				lastRaw: raw
			});
		}
		_evalBinding(b, raw) {
			return isColorProperty(b.property) ? mapColor(b, raw) : mapScalar(b, raw);
		}
		_evalBindingCurrent(b, state) {
			const elapsed = this._wallClockMs - state.startTsMs;
			if (state.settlingMs <= 0 || elapsed >= state.settlingMs) return state.targetValue;
			let t = elapsed / state.settlingMs;
			if (t < 0) t = 0;
			if (t > 1) t = 1;
			const eased = applyEasing(state.curve, t);
			if (isColorProperty(b.property)) return argbLerp(state.startValue, state.targetValue, eased);
			return state.startValue + (state.targetValue - state.startValue) * eased;
		}
		_anyBindingSettling() {
			for (const s of this._bindingState.values()) {
				if (s.settlingMs <= 0) continue;
				if (this._wallClockMs - s.startTsMs < s.settlingMs) return true;
			}
			return false;
		}
		/**
		* Advances the playback clock by [dtMs] milliseconds. Typically called from
		* a `requestAnimationFrame` loop with the per-frame delta. Notifies listeners
		* if this tick produces a new pose.
		*/
		advance(dtMs) {
			if (dtMs <= 0) return;
			this._wallClockMs += dtMs;
			const bindingActive = this._anyBindingSettling();
			const repaint = this._isPlaying || bindingActive || this._bindingDirty;
			if (this._isPlaying) {
				this._advanceStateClock(dtMs);
				if (this._inTransition) {
					this._transitionElapsedMs += dtMs * this.speed;
					if (this._transitionElapsedMs >= this._transitionMaxDurationMs) {
						const from = this._transitionFromState ?? this._currentState;
						const to = this._currentState;
						this._inTransition = false;
						this._isFadeTransition = false;
						this._activeTransition = null;
						this._snapshot.clear();
						this._transitionFromState = null;
						this._fireStateTransitionEnd({
							from,
							to
						});
					}
				}
			}
			if (repaint) {
				this._bindingDirty = false;
				this._notify();
			}
		}
		_advanceStateClock(dtMs) {
			const cfg = this.animation.stateConfigs[this._currentState];
			if (!cfg) return;
			const span = cfg.windowOut - cfg.windowIn;
			if (span <= 0) {
				this._stateTimeMs = cfg.windowIn;
				return;
			}
			const step = dtMs * this.speed;
			switch (this.mode) {
				case "loop": {
					let u = (this._stateTimeMs + step - cfg.windowIn) % span;
					if (u < 0) u += span;
					this._stateTimeMs = cfg.windowIn + u;
					break;
				}
				case "oneShot": {
					const t = this._stateTimeMs + step;
					if (t <= cfg.windowIn) this._stateTimeMs = cfg.windowIn;
					else if (t >= cfg.windowOut) {
						this._stateTimeMs = cfg.windowOut;
						this._isPlaying = false;
					} else this._stateTimeMs = t;
					break;
				}
				case "pingPong": {
					let remaining = step;
					while (remaining > 0) {
						const boundary = this._direction > 0 ? cfg.windowOut : cfg.windowIn;
						const distance = (boundary - this._stateTimeMs) * this._direction;
						if (remaining < distance) {
							this._stateTimeMs += remaining * this._direction;
							remaining = 0;
						} else {
							this._stateTimeMs = boundary;
							remaining -= distance;
							this._direction = this._direction === 1 ? -1 : 1;
						}
					}
					break;
				}
			}
		}
		/** Computes the resolved pose for every element at the current frame. */
		resolveAll() {
			const out = /* @__PURE__ */ new Map();
			for (const id of this.animation.elementOrder) {
				const el = this.animation.elements[id];
				if (!el) continue;
				let pose = resolveElement(el, this._currentState, this._stateTimeMs);
				if (this._inTransition) pose = this._applyTransition(pose, el);
				if (el.dataBindings.length > 0) pose = this._applyBindings(pose, el);
				out.set(id, pose);
			}
			return out;
		}
		_applyTransition(target, el) {
			if (this._isFadeTransition) return target;
			const globalDur = this._activeTransition?.duration ?? this.animation.defaultTransition.duration;
			const globalCurve = this._activeTransition?.curve ?? this.animation.defaultTransition.curve;
			const ov = this._activeTransition?.elements[el.id];
			const delay = ov?.delay ?? 0;
			const duration = ov?.duration ?? globalDur;
			const curve = ov?.curve ?? globalCurve;
			const elapsed = this._transitionElapsedMs - delay;
			if (elapsed <= 0) return this._snapshot.get(el.id) ?? identityResolved(el);
			if (duration <= 0) return target;
			let p = elapsed / duration;
			if (p < 0) p = 0;
			if (p > 1) p = 1;
			const eased = applyEasing(curve, p);
			if (eased >= 1) return target;
			return blendResolved(this._snapshot.get(el.id) ?? identityResolved(el), target, eased);
		}
		_applyBindings(base, el) {
			let { x, y, rotation, scaleX, scaleY, opacity } = base;
			let fillOverride = base.fillOverride;
			let strokeOverride = base.strokeOverride;
			let strokeDashOffset = base.strokeDashOffset;
			for (const b of el.dataBindings) {
				const raw = this._dataValues.get(b.dataKey);
				if (raw === void 0) continue;
				const state = this._bindingState.get(b.id);
				const value = state !== void 0 ? this._evalBindingCurrent(b, state) : this._evalBinding(b, raw);
				switch (b.property) {
					case "x":
						x = value;
						break;
					case "y":
						y = value;
						break;
					case "rotation":
						rotation = value;
						break;
					case "scaleX":
						scaleX = value;
						break;
					case "scaleY":
						scaleY = value;
						break;
					case "opacity":
						opacity = value;
						break;
					case "fill":
						fillOverride = value;
						break;
					case "stroke":
						strokeOverride = value;
						break;
					case "strokeDashOffset":
						strokeDashOffset = value;
						break;
				}
			}
			return {
				x,
				y,
				rotation,
				scaleX,
				scaleY,
				opacity,
				zIndex: base.zIndex,
				hidden: base.hidden,
				pathProgress: base.pathProgress,
				pivotX: base.pivotX,
				pivotY: base.pivotY,
				fillOverride,
				strokeOverride,
				strokeDashOffset,
				nodePositions: base.nodePositions
			};
		}
		/** Registers a listener that fires whenever playback state changes.
		*  Returns an unsubscribe function. */
		addListener(fn) {
			this._listeners.add(fn);
			return () => {
				this._listeners.delete(fn);
			};
		}
		removeListener(fn) {
			this._listeners.delete(fn);
		}
		/** Fires synchronously inside [setState]. Returns an unsubscribe function. */
		onStateChange(handler) {
			this._stateChangeHandlers.add(handler);
			return () => {
				this._stateChangeHandlers.delete(handler);
			};
		}
		/** Fires when a state transition's blend completes. Returns an unsubscribe. */
		onStateTransitionEnd(handler) {
			this._stateTransitionEndHandlers.add(handler);
			return () => {
				this._stateTransitionEndHandlers.delete(handler);
			};
		}
		_notify() {
			for (const l of this._listeners) l();
		}
		_fireStateChange(event) {
			for (const h of this._stateChangeHandlers) h(event);
		}
		_fireStateTransitionEnd(event) {
			for (const h of this._stateTransitionEndHandlers) h(event);
		}
		/** Releases listeners. Call when the controller is no longer in use. */
		dispose() {
			this._listeners.clear();
			this._stateChangeHandlers.clear();
			this._stateTransitionEndHandlers.clear();
		}
	};
	function findTransition(transitions, from, to) {
		for (const t of transitions) if (t.from === from && t.to === to) return t;
		return null;
	}
	function toBindingInfo(b, elementId) {
		return {
			id: b.id,
			elementId,
			dataKey: b.dataKey,
			property: b.property,
			isColor: isColorProperty(b.property),
			inMin: b.inMin,
			inMax: b.inMax,
			outMin: b.outMin,
			outMax: b.outMax,
			colorMinArgb: b.colorMinArgb,
			colorMaxArgb: b.colorMaxArgb,
			settlingMs: b.settlingMs,
			curve: b.curve
		};
	}

//#endregion
//#region src/render/box-fit.ts
/**
	* Applies a BoxFit transform to [ctx], mapping the SVG viewport into a target
	* rectangle of `(cssW, cssH)` CSS pixels. Caller must `save()` first; this
	* function does not touch save/restore state.
	*/
	function applyBoxFit(ctx, fit, cssW, cssH, vp) {
		if (vp.width <= 0 || vp.height <= 0) return;
		const sx = cssW / vp.width;
		const sy = cssH / vp.height;
		let scale;
		let offset;
		switch (fit) {
			case "fill":
				scale = {
					x: sx,
					y: sy
				};
				offset = {
					x: 0,
					y: 0
				};
				break;
			case "cover": {
				const s = Math.max(sx, sy);
				scale = {
					x: s,
					y: s
				};
				offset = {
					x: (cssW - vp.width * s) / 2,
					y: (cssH - vp.height * s) / 2
				};
				break;
			}
			case "fitWidth":
				scale = {
					x: sx,
					y: sx
				};
				offset = {
					x: 0,
					y: (cssH - vp.height * sx) / 2
				};
				break;
			case "fitHeight":
				scale = {
					x: sy,
					y: sy
				};
				offset = {
					x: (cssW - vp.width * sy) / 2,
					y: 0
				};
				break;
			case "scaleDown": {
				const s = Math.min(1, Math.min(sx, sy));
				scale = {
					x: s,
					y: s
				};
				offset = {
					x: (cssW - vp.width * s) / 2,
					y: (cssH - vp.height * s) / 2
				};
				break;
			}
			case "none":
				scale = {
					x: 1,
					y: 1
				};
				offset = {
					x: (cssW - vp.width) / 2,
					y: (cssH - vp.height) / 2
				};
				break;
			default: {
				const s = Math.min(sx, sy);
				scale = {
					x: s,
					y: s
				};
				offset = {
					x: (cssW - vp.width * s) / 2,
					y: (cssH - vp.height * s) / 2
				};
				break;
			}
		}
		ctx.translate(offset.x, offset.y);
		ctx.scale(scale.x, scale.y);
		ctx.translate(-vp.x, -vp.y);
	}

//#endregion
//#region src/render/paint.ts
/**
	* Resolves an SvgPaint to a value assignable to `ctx.fillStyle` / `strokeStyle`.
	* For solid colours this is a CSS rgba() string; for gradients it is a
	* CanvasGradient created on [ctx].
	*
	* `bounds` is the geometry's local-space bbox, used to map gradients in
	* `objectBoundingBox` mode. May be null when no geometry was registered.
	*/
	function resolvePaint(ctx, paint, bounds) {
		switch (paint.kind) {
			case "solid": return argbToCss(paint.argb);
			case "linearGradient": return makeLinearGradient(ctx, paint, bounds);
			case "radialGradient": return makeRadialGradient(ctx, paint, bounds);
		}
	}
	function makeLinearGradient(ctx, g, bounds) {
		let x1 = g.x1, y1 = g.y1, x2 = g.x2, y2 = g.y2;
		if (g.objectBoundingBox && bounds) {
			x1 = bounds.x + x1 * bounds.width;
			y1 = bounds.y + y1 * bounds.height;
			x2 = bounds.x + x2 * bounds.width;
			y2 = bounds.y + y2 * bounds.height;
		}
		if (g.gradientTransform) {
			[x1, y1] = applyMatrix(g.gradientTransform, x1, y1);
			[x2, y2] = applyMatrix(g.gradientTransform, x2, y2);
		}
		const grad = ctx.createLinearGradient(x1, y1, x2, y2);
		addStops(grad, g.colors, g.stops);
		return grad;
	}
	function makeRadialGradient(ctx, g, bounds) {
		let cx = g.cx, cy = g.cy, r = g.r;
		let fx = g.fx ?? cx;
		let fy = g.fy ?? cy;
		if (g.objectBoundingBox && bounds) {
			cx = bounds.x + cx * bounds.width;
			cy = bounds.y + cy * bounds.height;
			fx = bounds.x + fx * bounds.width;
			fy = bounds.y + fy * bounds.height;
			r = Math.max(bounds.width, bounds.height) * r;
		}
		if (g.gradientTransform) {
			[cx, cy] = applyMatrix(g.gradientTransform, cx, cy);
			[fx, fy] = applyMatrix(g.gradientTransform, fx, fy);
		}
		const grad = ctx.createRadialGradient(fx, fy, 0, cx, cy, r);
		addStops(grad, g.colors, g.stops);
		return grad;
	}
	function addStops(grad, colors, stops) {
		for (let i = 0; i < colors.length; i++) {
			const stop = stops[i] ?? (colors.length > 1 ? i / (colors.length - 1) : 0);
			grad.addColorStop(clamp01(stop), argbToCss(colors[i]));
		}
	}
	function applyMatrix(m, x, y) {
		return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
	}
	function clamp01(v) {
		return v < 0 ? 0 : v > 1 ? 1 : v;
	}

//#endregion
//#region src/render/animation-renderer.ts
/**
	* Renders a [VectorAnimateController]'s current pose into an HTML <canvas>.
	*
	* Owns a `requestAnimationFrame` loop while [start]ed; each tick advances the
	* controller and repaints the canvas. Uses the canvas's CSS pixel size
	* (`clientWidth` / `clientHeight`) and scales the context by
	* `devicePixelRatio` for crisp rendering on retina displays. A
	* `ResizeObserver` keeps the bitmap size in sync with the CSS size.
	*/
	var AnimationRenderer = class {
		constructor(canvas, controller, options = {}) {
			this._dpr = 1;
			this._cssWidth = 0;
			this._cssHeight = 0;
			this._rafId = null;
			this._lastTickMs = null;
			this._resizeObserver = null;
			this._warmUpDone = false;
			this.canvas = canvas;
			this.controller = controller;
			this.boxFit = options.boxFit ?? "contain";
			this._warmUpOption = options.warmUp;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("AnimationRenderer: canvas.getContext(\"2d\") returned null");
			this._ctx = ctx;
			this._syncCanvasSize();
			if (typeof ResizeObserver !== "undefined") {
				this._resizeObserver = new ResizeObserver(() => this._syncCanvasSize());
				this._resizeObserver.observe(canvas);
			}
		}
		/** Begins the RAF loop. No-op if already running. */
		start() {
			if (this._rafId !== null) return;
			if (!this._warmUpDone) {
				this._warmUpDone = true;
				const hint = this.controller.animation.runtimeHints?.warmUp;
				if (this._warmUpOption ?? hint ?? true) this._paint();
			}
			const tick = (now) => {
				if (this._lastTickMs !== null) {
					let dt = now - this._lastTickMs;
					if (dt > 100) dt = 100;
					this.controller.advance(dt);
				}
				this._lastTickMs = now;
				this._paint();
				this._rafId = requestAnimationFrame(tick);
			};
			this._rafId = requestAnimationFrame(tick);
		}
		/** Stops the RAF loop. The canvas keeps its last frame. */
		stop() {
			if (this._rafId !== null) {
				cancelAnimationFrame(this._rafId);
				this._rafId = null;
			}
			this._lastTickMs = null;
		}
		/** Forces a single repaint without advancing the controller. */
		paint() {
			this._paint();
		}
		/** Stops the RAF loop and disconnects the ResizeObserver. */
		dispose() {
			this.stop();
			this._resizeObserver?.disconnect();
			this._resizeObserver = null;
		}
		_syncCanvasSize() {
			const dpr = typeof window !== "undefined" && window.devicePixelRatio || 1;
			const cssW = this.canvas.clientWidth || this.canvas.width;
			const cssH = this.canvas.clientHeight || this.canvas.height;
			const bitmapW = Math.max(1, Math.round(cssW * dpr));
			const bitmapH = Math.max(1, Math.round(cssH * dpr));
			if (this.canvas.width !== bitmapW) this.canvas.width = bitmapW;
			if (this.canvas.height !== bitmapH) this.canvas.height = bitmapH;
			this._dpr = dpr;
			this._cssWidth = cssW;
			this._cssHeight = cssH;
		}
		_paint() {
			const ctx = this._ctx;
			const animation = this.controller.animation;
			const vp = animation.viewport;
			ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
			if (vp.backgroundArgb !== null) {
				ctx.fillStyle = argbToCss(vp.backgroundArgb);
				ctx.fillRect(0, 0, this._cssWidth, this._cssHeight);
			} else ctx.clearRect(0, 0, this._cssWidth, this._cssHeight);
			if (vp.width <= 0 || vp.height <= 0) return;
			ctx.save();
			applyBoxFit(ctx, this.boxFit, this._cssWidth, this._cssHeight, vp);
			ctx.beginPath();
			ctx.rect(vp.x, vp.y, vp.width, vp.height);
			ctx.clip();
			const fade = this.controller.transitionInFadeOpacity;
			const scope = {
				ctx,
				animation,
				resolved: this.controller.resolveAll()
			};
			if (fade < 1) {
				const prevAlpha = ctx.globalAlpha;
				ctx.globalAlpha = prevAlpha * fade;
				paintNode(animation.scene, scope);
				ctx.globalAlpha = prevAlpha;
			} else paintNode(animation.scene, scope);
			ctx.restore();
		}
	};
	function paintNode(node, scope) {
		const { ctx, animation, resolved } = scope;
		const el = node.id !== null ? animation.elements[node.id] : void 0;
		if (el && !el.visible) return;
		const anim = node.id !== null ? resolved.get(node.id) : void 0;
		if (anim?.hidden === true) return;
		ctx.save();
		if (el?.clipMaskId) {
			const maskNode = animation.sceneIndex.get(el.clipMaskId);
			if (maskNode) {
				const maskPath = buildMaskPath(maskNode, resolved.get(el.clipMaskId));
				if (maskPath) ctx.clip(maskPath);
			}
		}
		if (node.clipPath) ctx.clip(node.clipPath);
		if (anim) {
			ctx.translate(anim.pivotX + anim.x, anim.pivotY + anim.y);
			if (anim.rotation !== 0) ctx.rotate(anim.rotation * Math.PI / 180);
			if (anim.scaleX !== 1 || anim.scaleY !== 1) ctx.scale(anim.scaleX, anim.scaleY);
			ctx.translate(-anim.pivotX, -anim.pivotY);
		}
		if (node.transform) {
			const m = node.transform;
			ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
		}
		const effectiveOpacity = (anim?.opacity ?? 1) * node.opacity;
		if (effectiveOpacity <= 0) {
			ctx.restore();
			return;
		}
		const prevAlpha = ctx.globalAlpha;
		if (effectiveOpacity < 1) ctx.globalAlpha = prevAlpha * effectiveOpacity;
		if (node.geometry) drawGeometry(node, anim, scope);
		paintChildren(node.children, scope);
		if (effectiveOpacity < 1) ctx.globalAlpha = prevAlpha;
		ctx.restore();
	}
	function paintChildren(children, scope) {
		if (children.length === 0) return;
		let needsSort = false;
		for (const c of children) if (c.id !== null && (scope.resolved.get(c.id)?.zIndex ?? null) !== null) {
			needsSort = true;
			break;
		}
		if (!needsSort) {
			for (const c of children) paintNode(c, scope);
			return;
		}
		const indexed = children.map((c, i) => {
			return [c.id !== null ? scope.resolved.get(c.id)?.zIndex ?? i : i, c];
		});
		indexed.sort((a, b) => a[0] - b[0]);
		for (const [, c] of indexed) paintNode(c, scope);
	}
	function drawGeometry(node, anim, scope) {
		const { ctx } = scope;
		const el = node.id !== null ? scope.animation.elements[node.id] : void 0;
		const geom = (anim?.nodePositions && buildPath2DFromNodes(anim.nodePositions)) ?? el?.polylinePath ?? node.geometry;
		const fillSrc = anim?.fillOverride !== null && anim?.fillOverride !== void 0 ? {
			kind: "solid",
			argb: anim.fillOverride
		} : node.fill;
		const strokeSrc = anim?.strokeOverride !== null && anim?.strokeOverride !== void 0 ? {
			kind: "solid",
			argb: anim.strokeOverride
		} : node.stroke;
		if (fillSrc) {
			ctx.fillStyle = resolvePaint(ctx, fillSrc, node.geometryBounds);
			ctx.fill(geom);
		}
		if (strokeSrc && node.strokeWidth > 0) {
			ctx.strokeStyle = resolvePaint(ctx, strokeSrc, node.geometryBounds);
			ctx.lineWidth = node.strokeWidth;
			ctx.lineCap = node.strokeLinecap;
			ctx.lineJoin = node.strokeLinejoin;
			const usingPolyline = el?.polylinePath != null && !anim?.nodePositions;
			applyStrokeDash(ctx, node, anim, usingPolyline ? el.polylineClosed : node.geometryClosed, usingPolyline ? el.polylineLength : node.geometryLength);
			ctx.stroke(geom);
		}
	}
	function applyStrokeDash(ctx, node, anim, geomClosed, geomLength) {
		if (node.strokeDashArray.length === 0) {
			ctx.setLineDash([]);
			ctx.lineDashOffset = 0;
			return;
		}
		const offset = anim?.strokeDashOffset ?? node.strokeDashOffset;
		if (geomClosed && geomLength > 0) {
			let rawCycle = 0;
			for (const v of node.strokeDashArray) rawCycle += v;
			if (rawCycle > 0) {
				const scale = geomLength / (Math.max(1, Math.round(geomLength / rawCycle)) * rawCycle);
				const scaled = node.strokeDashArray.map((v) => v * scale);
				ctx.setLineDash(scaled);
				ctx.lineDashOffset = offset * scale;
				return;
			}
		}
		ctx.setLineDash(node.strokeDashArray);
		ctx.lineDashOffset = offset;
	}
	/**
	* Builds the clip region for an element whose `clipMaskId` references
	* `maskNode`. Walks the entire mask subtree so masks rooted on a `<g>` (a
	* "group" animated element with no own geometry) accumulate the union of
	* their descendants' shapes, matching the authoring tool's expectation.
	*
	* Returns null when the subtree contributes no geometry — the caller treats
	* that as "no clip" rather than "clip everything out".
	*/
	function buildMaskPath(maskNode, anim) {
		const result = new Path2D();
		const root = anim ? animTransformOf(anim) : IDENTITY;
		let added = 0;
		function walk(node, parentTransform) {
			const combined = node.transform ? multiplyMatrices(parentTransform, node.transform) : parentTransform;
			if (node.geometry) {
				result.addPath(node.geometry, {
					a: combined[0],
					b: combined[1],
					c: combined[2],
					d: combined[3],
					e: combined[4],
					f: combined[5]
				});
				added++;
			}
			for (const child of node.children) walk(child, combined);
		}
		walk(maskNode, root);
		return added > 0 ? result : null;
	}
	/**
	* Builds a Path2D directly from animated path-node positions. Iteration order
	* of `nodes` defines the traversal — entries flagged `isMove` (or the very
	* first entry) start a new sub-path; otherwise we emit a line or cubic bezier
	* depending on whether either endpoint carries control points.
	*
	* Returns null when `nodes` is empty so the caller can fall back to the static
	* geometry without a guard at the call site.
	*/
	function buildPath2DFromNodes(nodes) {
		if (nodes.size === 0) return null;
		const path = new Path2D();
		let prev = null;
		let contourStart = null;
		let first = true;
		for (const node of nodes.values()) {
			if (first || node.isMove) {
				path.moveTo(node.x, node.y);
				contourStart = node;
				prev = node;
				first = false;
				continue;
			}
			if (prev) {
				const cpOut = prev.cpOut;
				const cpIn = node.cpIn;
				if (cpOut || cpIn) path.bezierCurveTo(cpOut ? cpOut.x : prev.x, cpOut ? cpOut.y : prev.y, cpIn ? cpIn.x : node.x, cpIn ? cpIn.y : node.y, node.x, node.y);
				else path.lineTo(node.x, node.y);
			}
			if (node.close && contourStart) {
				const closeCpOut = node.cpOut;
				const closeCpIn = contourStart.cpIn;
				if (closeCpOut || closeCpIn) path.bezierCurveTo(closeCpOut ? closeCpOut.x : node.x, closeCpOut ? closeCpOut.y : node.y, closeCpIn ? closeCpIn.x : contourStart.x, closeCpIn ? closeCpIn.y : contourStart.y, contourStart.x, contourStart.y);
				path.closePath();
				contourStart = null;
			}
			prev = node;
		}
		return path;
	}
	/** Builds the pivot-relative animated transform as a matrix. */
	function animTransformOf(anim) {
		const cos = Math.cos(anim.rotation * Math.PI / 180);
		const sin = Math.sin(anim.rotation * Math.PI / 180);
		let m = [
			1,
			0,
			0,
			1,
			anim.pivotX + anim.x,
			anim.pivotY + anim.y
		];
		m = multiplyMatrices(m, [
			cos,
			sin,
			-sin,
			cos,
			0,
			0
		]);
		m = multiplyMatrices(m, [
			anim.scaleX,
			0,
			0,
			anim.scaleY,
			0,
			0
		]);
		m = multiplyMatrices(m, [
			1,
			0,
			0,
			1,
			-anim.pivotX,
			-anim.pivotY
		]);
		return m;
	}

//#endregion
//#region src/player.ts
/**
	* Convenience facade combining a `VarLoader` source, a
	* `VectorAnimateController`, and an `AnimationRenderer`. Most apps should use
	* this instead of wiring those parts directly.
	*
	* ```ts
	* const player = await VectorAnimatePlayer.create(canvas, '/anims/card.var');
	* player.setState('hover');
	* player.setData('temperature', 0.75);
	* ```
	*
	* For advanced use the underlying `controller` and `renderer` are exposed.
	*/
	var VectorAnimatePlayer = class VectorAnimatePlayer {
		/**
		* Async factory: resolves [source] to a `VectorAnimation`, builds the
		* controller + renderer, and starts the RAF loop.
		*/
		static async create(canvas, source, options = {}) {
			return new VectorAnimatePlayer(canvas, await resolveSource(source), options);
		}
		constructor(canvas, animation, options = {}) {
			this.canvas = canvas;
			this.animation = animation;
			this.controller = new VectorAnimateController(animation, {
				initialState: options.initialState,
				mode: options.mode,
				speed: options.speed,
				autoplay: options.autoplay
			});
			this.renderer = new AnimationRenderer(canvas, this.controller, { boxFit: options.boxFit });
			this.renderer.start();
		}
		play() {
			this.controller.play();
		}
		pause() {
			this.controller.pause();
		}
		stop() {
			this.controller.stop();
		}
		seekTo(ms) {
			this.controller.seekTo(ms);
		}
		setState(state) {
			this.controller.setState(state);
		}
		get currentState() {
			return this.controller.currentState;
		}
		get position() {
			return this.controller.position;
		}
		get isPlaying() {
			return this.controller.isPlaying;
		}
		get isInTransition() {
			return this.controller.isInTransition;
		}
		get mode() {
			return this.controller.mode;
		}
		set mode(value) {
			this.controller.mode = value;
		}
		get speed() {
			return this.controller.speed;
		}
		set speed(value) {
			this.controller.speed = value;
		}
		get boxFit() {
			return this.renderer.boxFit;
		}
		set boxFit(value) {
			this.renderer.boxFit = value;
		}
		setData(key, value) {
			this.controller.setData(key, value);
		}
		setDataMap(values) {
			this.controller.setDataMap(values);
		}
		clearData(key) {
			this.controller.clearData(key);
		}
		getData(key) {
			return this.controller.getData(key);
		}
		get dataKeys() {
			return this.controller.dataKeys;
		}
		get declaredDataKeys() {
			return this.controller.declaredDataKeys;
		}
		/** Snapshot of every state declared by the animation. */
		listStates() {
			return this.controller.listStates();
		}
		/** Looks up a single state's metadata by name. */
		getStateInfo(name) {
			return this.controller.getStateInfo(name);
		}
		/** Every declared `DataBinding`, decorated with its owning element's id. */
		listBindings() {
			return this.controller.listBindings();
		}
		/** Every distinct data key, the bindings that consume it, and its current value. */
		listDataKeys() {
			return this.controller.listDataKeys();
		}
		/**
		* Subscribes to a typed player event. Returns an unsubscribe function.
		* Equivalent to calling the matching method on `controller` directly.
		*/
		on(event, handler) {
			switch (event) {
				case "stateChange": return this.controller.onStateChange(handler);
				case "stateTransitionEnd": return this.controller.onStateTransitionEnd(handler);
			}
		}
		/** Stops RAF, releases listeners, disconnects the resize observer. */
		dispose() {
			this.renderer.dispose();
			this.controller.dispose();
		}
	};
	async function resolveSource(source) {
		if (typeof source === "string") return VarLoader.fromUrl(source);
		if (source instanceof Uint8Array) return VarLoader.fromBytes(source);
		if (isVectorAnimation(source)) return source;
		return VarLoader.fromJson(source);
	}
	function isVectorAnimation(x) {
		return typeof x === "object" && x !== null && "sceneIndex" in x && x.sceneIndex instanceof Map;
	}

//#endregion
exports.AnimationRenderer = AnimationRenderer;
exports.IDENTITY = IDENTITY;
exports.VarLoader = VarLoader;
exports.VectorAnimateController = VectorAnimateController;
exports.VectorAnimatePlayer = VectorAnimatePlayer;
exports.applyBoxFit = applyBoxFit;
exports.applyEasing = applyEasing;
exports.argbLerp = argbLerp;
exports.argbToCss = argbToCss;
exports.blendResolved = blendResolved;
exports.identityResolved = identityResolved;
exports.isColorProperty = isColorProperty;
exports.isIdentity = isIdentity;
exports.lerp = lerp;
exports.lerpAngleDeg = lerpAngleDeg;
exports.lerpNullable = lerpNullable;
exports.mapColor = mapColor;
exports.mapScalar = mapScalar;
exports.multiplyMatrices = multiplyMatrices;
exports.parseCssColorToArgb = parseCssColorToArgb;
exports.parseSvg = parseSvg;
exports.resolveElement = resolveElement;
exports.resolvePaint = resolvePaint;
exports.resolvedFromKeyframe = resolvedFromKeyframe;
return exports;
})({});
//# sourceMappingURL=index.iife.js.map