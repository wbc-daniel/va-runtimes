//#region src/scene/scene-node.d.ts
/**
 * 2D affine transform as the 6-element tuple [a, b, c, d, e, f], matching the
 * CSS/Canvas `transform(a,b,c,d,e,f)` and SVG `matrix(a,b,c,d,e,f)` convention:
 *
 *   | a  c  e |
 *   | b  d  f |
 *   | 0  0  1 |
 */
type Matrix2D = [number, number, number, number, number, number];
declare const IDENTITY: Matrix2D;
/** Returns true when m is (within floating-point tolerance) the identity. */
declare function isIdentity(m: Matrix2D): boolean;
/** A × B — applies B first, then A. */
declare function multiplyMatrices(A: Matrix2D, B: Matrix2D): Matrix2D;
type SvgPaint = SolidPaint | LinearGradientPaint | RadialGradientPaint;
interface SolidPaint {
  readonly kind: 'solid';
  /** ARGB integer, e.g. 0xFF000000 for opaque black. */
  readonly argb: number;
}
type SpreadMethod = 'pad' | 'reflect' | 'repeat';
interface LinearGradientPaint {
  readonly kind: 'linearGradient';
  /** Gradient line start (in objectBoundingBox fractions or user-space). */
  readonly x1: number;
  readonly y1: number;
  /** Gradient line end. */
  readonly x2: number;
  readonly y2: number;
  /** ARGB integers, one per stop. */
  readonly colors: readonly number[];
  readonly stops: readonly number[];
  readonly spreadMethod: SpreadMethod;
  /** If true, coordinates are 0..1 fractions of the element's bounding box. */
  readonly objectBoundingBox: boolean;
  readonly gradientTransform: Matrix2D | null;
}
interface RadialGradientPaint {
  readonly kind: 'radialGradient';
  /** Centre of the outermost circle. */
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Focal point. null = same as (cx, cy). */
  readonly fx: number | null;
  readonly fy: number | null;
  readonly colors: readonly number[];
  readonly stops: readonly number[];
  readonly spreadMethod: SpreadMethod;
  readonly objectBoundingBox: boolean;
  readonly gradientTransform: Matrix2D | null;
}
/** Axis-aligned bounding box in user-space SVG coordinates. */
interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface SceneNode {
  /** SVG id attribute — used to look up the matching AnimatedElement. */
  readonly id: string | null;
  readonly tagName: string;
  /** null for container-only nodes (<svg>, <g>). */
  readonly geometry: Path2D | null;
  /** Pre-computed bounds for the geometry. null when geometry is null. */
  readonly geometryBounds: Bounds | null;
  /** Total stroked length of the geometry in user-space units. 0 when not
   *  computable (e.g. headless test environment without a DOM). Used by the
   *  renderer to scale the dash array on closed paths so the dash pattern
   *  tiles cleanly across the closure seam. */
  readonly geometryLength: number;
  /** True when the geometry is a closed loop (rect, circle, ellipse,
   *  polygon, or `<path>` ending in Z). */
  readonly geometryClosed: boolean;
  /** Resolved through SVG inheritance. null = no fill. */
  readonly fill: SvgPaint | null;
  /** Resolved through SVG inheritance. null = no stroke. */
  readonly stroke: SvgPaint | null;
  readonly strokeWidth: number;
  readonly strokeLinecap: 'butt' | 'round' | 'square';
  readonly strokeLinejoin: 'miter' | 'round' | 'bevel';
  /**
   * SVG `stroke-dasharray` parsed into a number list. Empty = solid stroke.
   * Combined with `strokeLinecap === 'round'`, an array like `[0, 12]`
   * produces a dotted line of round dots.
   */
  readonly strokeDashArray: readonly number[];
  /**
   * Static `stroke-dashoffset` from the SVG attribute. Used when no animated
   * value is supplied. Defaults to 0.
   */
  readonly strokeDashOffset: number;
  /** Static SVG transform attribute, if any. */
  readonly transform: Matrix2D | null;
  /** Static per-element opacity (not the animated value). */
  readonly opacity: number;
  /** clip-path="url(#id)" resolved to a flat Path2D, if any. */
  readonly clipPath: Path2D | null;
  readonly children: readonly SceneNode[];
}
//#endregion
//#region src/model/types.d.ts
/** Easing curve identifier as it appears in the .var.json format (kebab-case). */
type EasingCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'ease-in-out-back' | 'step' | 'bounce-in' | 'bounce-out' | 'elastic-in' | 'elastic-out';
/** Animatable property that a DataBinding can drive. */
type BoundProperty = 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity' | 'fill' | 'stroke' | 'strokeDashOffset';
/** How an element enters when a state transition begins. */
type TransitionInType = 'animate' | 'fade';
/** Playback loop behaviour for the active state window. */
type PlaybackMode = 'loop' | 'oneShot' | 'pingPong';
interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  /** ARGB integer, e.g. 0xFF_FF_FF_FF for opaque white. null = transparent. */
  backgroundArgb: number | null;
}
/** A single anchor on a path. cpIn/cpOut control the bezier handles incident
 *  on this node; isMove starts a new sub-path; close ends the current sub-path. */
interface NodePos {
  readonly x: number;
  readonly y: number;
  readonly cpIn: {
    readonly x: number;
    readonly y: number;
  } | null;
  readonly cpOut: {
    readonly x: number;
    readonly y: number;
  } | null;
  readonly isMove: boolean;
  readonly close: boolean;
}
interface Keyframe {
  id: string;
  /** Milliseconds from the start of the state window. */
  time: number;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  /** Draw-order override. null = use natural elementOrder position. */
  zIndex: number | null;
  /** Motion-path position 0–100. null = not on a motion path. */
  pathProgress: number | null;
  /**
   * Animated `stroke-dashoffset` for the underlying scene node's stroke. null
   * = this keyframe doesn't drive the offset (resolver leaves it unowned).
   * The dash *pattern* itself comes from the SVG's static `stroke-dasharray`.
   */
  strokeDashOffset: number | null;
  /**
   * Keyframeable visibility. null = transparent (unset), true = hidden
   * (element skipped entirely during paint), false = explicitly shown.
   * Step-hold: the last non-null value at or before the current time is used.
   */
  hidden: boolean | null;
  /**
   * Per-anchor positions for path-node morphing. null when this keyframe does
   * not drive the path geometry. Insertion order matches the original path's
   * `M`/`L`/`C` traversal — preserved via Map iteration order so the renderer
   * can stream node entries straight into a `d` string without re-sorting.
   */
  nodePositions: ReadonlyMap<string, NodePos> | null;
  /** Entry easing into this keyframe from the previous one. */
  curve: EasingCurve;
  /**
   * Selective channel declaration. null = legacy: this keyframe drives all six
   * transform channels. Non-null: only the named channels are owned by this
   * keyframe; others skip it during per-channel interpolation.
   */
  props: ReadonlySet<string> | null;
}
interface ElementAnimation {
  /** Sorted by time ascending. */
  readonly keyframes: readonly Keyframe[];
}
interface DataBinding {
  id: string;
  property: BoundProperty;
  dataKey: string;
  /** Duration of the settling animation when the external value changes (ms). */
  settlingMs: number;
  curve: EasingCurve;
  /** Input domain clamp. */
  inMin: number;
  inMax: number;
  /** Scalar output range (ignored for color properties). */
  outMin: number;
  outMax: number;
  /** ARGB integers for color lerp endpoints. null when property is not a color. */
  colorMinArgb: number | null;
  colorMaxArgb: number | null;
}
interface AnimatedElement {
  id: string;
  tagName: string;
  pivotX: number;
  pivotY: number;
  visible: boolean;
  /** Keyed by state name. */
  readonly animations: Readonly<Record<string, ElementAnimation>>;
  readonly dataBindings: readonly DataBinding[];
  /** ID of another AnimatedElement to use as a clip mask. null = no mask. */
  clipMaskId: string | null;
  /**
   * Pre-tessellated polyline geometry baked at export time (option 4 in the
   * designer's runtime-export modal). When present, the renderer uses this
   * Path2D instead of the SVG-derived `SceneNode.geometry`, bypassing curve
   * tessellation on first paint.
   */
  polylinePath: Path2D | null;
  /** Total polyline length (sum of segment lengths). Used for dash scaling on
   *  closed contours. 0 when no polyline is present. */
  polylineLength: number;
  /** True when at least one polyline contour is closed. */
  polylineClosed: boolean;
}
/**
 * Hints recorded by the designer's runtime-export pipeline describing what
 * baking passes have already been applied. Runtimes use these to skip work
 * that's been done upstream (e.g. warm-up cycles when geometry is already
 * pre-tessellated). `null` indicates the export pre-dates this block.
 */
interface RuntimeHints {
  /** When false, the runtime should skip its warm-up paint cycle. */
  readonly warmUp: boolean;
  /** True when every animated element was sampled at a fixed rate. */
  readonly preSampledKeyframes: boolean;
  /** Hz used for pre-sampling, or null when preSampledKeyframes is false. */
  readonly sampleRate: number | null;
  /** True when path geometry was flattened into polylines at export time. */
  readonly preTessellated: boolean;
  /** Max chord deviation used when flattening, in SVG units. null when off. */
  readonly tessellationFlatness: number | null;
}
interface TransitionInConfig {
  type: TransitionInType;
  /** Duration of the entrance animation (ms). */
  duration: number;
}
interface StateConfig {
  /** Total animation length for this state (ms). */
  duration: number;
  /** Playback start within the duration (ms). */
  windowIn: number;
  /** Playback end within the duration (ms). */
  windowOut: number;
  transitionIn: TransitionInConfig;
}
interface TransitionDefaults {
  duration: number;
  curve: EasingCurve;
}
interface ElementTransitionOverride {
  /** Extra delay before this element begins its transition (ms). */
  delay: number;
  /** Per-element duration override. null = use the global transition duration. */
  duration: number | null;
  /** Per-element easing override. null = use the global transition curve. */
  curve: EasingCurve | null;
}
interface StateTransition {
  from: string;
  to: string;
  duration: number;
  curve: EasingCurve;
  /** Per-element timing overrides, keyed by element ID. */
  readonly elements: Readonly<Record<string, ElementTransitionOverride>>;
}
interface VectorAnimation {
  name: string;
  fps: number;
  svgRaw: string;
  viewport: Viewport;
  readonly states: readonly string[];
  defaultState: string;
  readonly stateConfigs: Readonly<Record<string, StateConfig>>;
  readonly stateTransitions: readonly StateTransition[];
  defaultTransition: TransitionDefaults;
  readonly elements: Readonly<Record<string, AnimatedElement>>;
  readonly elementOrder: readonly string[];
  /** null when the export pre-dates the runtime-hints block. */
  readonly runtimeHints: RuntimeHints | null;
  /** Parsed SVG scene tree. Root node corresponds to the <svg> element. */
  readonly scene: SceneNode;
  /** Flat lookup of scene nodes by SVG id, built at parse time. */
  readonly sceneIndex: ReadonlyMap<string, SceneNode>;
  readonly warnings: readonly string[];
}
/**
 * Static + live description of one state in the animation. Returned by
 * `VectorAnimateController.listStates()` so hosts can build pickers,
 * dropdowns, or debug overlays without poking at internal model fields.
 */
interface StateInfo {
  name: string;
  /** Total animation length for this state (ms). */
  duration: number;
  /** Playback start within the duration (ms). */
  windowIn: number;
  /** Playback end within the duration (ms). */
  windowOut: number;
  transitionInType: TransitionInType;
  /** Duration of the entrance animation (ms). */
  transitionInDuration: number;
  /** True when this is `animation.defaultState`. */
  isDefault: boolean;
  /** True when this state is currently active on the controller. */
  isCurrent: boolean;
  /** Number of elements that declare a keyframe track for this state. */
  elementCount: number;
}
/**
 * One declared data binding in the animation, decorated with the id of the
 * element that owns it. Returned by `VectorAnimateController.listBindings()`.
 */
interface DataBindingInfo {
  id: string;
  /** Animated element that declares this binding. */
  elementId: string;
  dataKey: string;
  property: BoundProperty;
  /** True when `property` is `'fill'` or `'stroke'`. */
  isColor: boolean;
  inMin: number;
  inMax: number;
  /** Scalar output range. Meaningful only when `isColor` is false. */
  outMin: number;
  outMax: number;
  /** ARGB endpoint for color bindings. null when `isColor` is false. */
  colorMinArgb: number | null;
  colorMaxArgb: number | null;
  settlingMs: number;
  curve: EasingCurve;
}
/**
 * One data key declared by the animation, the bindings that consume it, and
 * the value (if any) currently held by the controller. Returned by
 * `VectorAnimateController.listDataKeys()`.
 */
interface DataKeyInfo {
  dataKey: string;
  /** All bindings (across all elements) that read `dataKey`. */
  bindings: readonly DataBindingInfo[];
  /** Last value passed to `setData(dataKey, …)`. undefined when never set. */
  currentValue: number | undefined;
  /** True when a value has been pushed for this key. */
  isSet: boolean;
}
/** Fully-interpolated pose for one element at a single point in time. */
interface ResolvedElement {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  /** null = natural elementOrder position. */
  zIndex: number | null;
  /** null = not on a motion path. */
  pathProgress: number | null;
  pivotX: number;
  pivotY: number;
  /** ARGB int fill override from a data binding. null = use SVG paint. */
  fillOverride: number | null;
  /** ARGB int stroke override from a data binding. null = use SVG paint. */
  strokeOverride: number | null;
  /**
   * Animated stroke-dashoffset. null = use the scene node's static
   * `strokeDashOffset` value instead.
   */
  strokeDashOffset: number | null;
  /**
   * Keyframeable visibility override. null = unset (element paints normally).
   * true = element is hidden (entire subtree skipped). false = explicitly shown.
   */
  hidden: boolean | null;
  /**
   * Resolved per-anchor positions for path-node morphing. null when no
   * keyframe drives the path geometry — renderer falls back to the static
   * scene-node geometry. Iteration order matches the original path traversal.
   */
  nodePositions: ReadonlyMap<string, NodePos> | null;
}
//#endregion
//#region src/scene/svg-parser.d.ts
interface SvgParseResult {
  readonly root: SceneNode;
  readonly sceneIndex: Map<string, SceneNode>;
  readonly warnings: string[];
}
/**
 * Parses the `svgRaw` field of a .var.json document into a SceneNode tree.
 * Unsupported elements/attributes produce entries in warnings rather than
 * throwing.
 */
declare function parseSvg(svgRaw: string): SvgParseResult;
//#endregion
//#region src/loader/loader.d.ts
/**
 * Loads and parses .var and .var.json animation files.
 *
 * Binary .var files use gzip compression prefixed with a 4-byte magic header
 * (VAB\x01). Decompression requires the native DecompressionStream API
 * (browsers, Node 18+).
 */
declare class VarLoader {
  /**
   * Fetches a .var or .var.json file from a URL and parses it.
   * Auto-detects binary vs text format.
   */
  static fromUrl(url: string): Promise<VectorAnimation>;
  /**
   * Parses raw bytes — either a binary .var (gzip + magic header) or a
   * UTF-8 encoded .var.json.
   */
  static fromBytes(bytes: Uint8Array<ArrayBuffer>): Promise<VectorAnimation>;
  /**
   * Parses a pre-loaded .var.json string.
   * Synchronous — does not handle binary format.
   */
  static fromJsonString(raw: string): VectorAnimation;
  /**
   * Parses a pre-decoded JSON object.
   * Synchronous — does not handle binary format.
   */
  static fromJson(obj: unknown): VectorAnimation;
}
//#endregion
//#region src/loader/css-color.d.ts
/**
 * Parses a CSS color string into a 32-bit ARGB integer.
 *
 * Supported formats: #RGB, #RRGGBB, #RRGGBBAA.
 * Returns null for null, empty, "none", "transparent", or unrecognised values.
 */
declare function parseCssColorToArgb(raw: string | null | undefined): number | null;
/** Converts an ARGB integer to a CSS rgba() string. */
declare function argbToCss(argb: number): string;
//#endregion
//#region src/engine/easing.d.ts
/**
 * Applies a curve to normalised progress t in [0, 1].
 *
 * Curves match the JS authoring tool's interpolation.js. Input is clamped at
 * the boundaries; output may overshoot [0, 1] for back/bounce/elastic curves
 * by design — that's what produces the visual overshoot.
 */
declare function applyEasing(curve: EasingCurve, t: number): number;
declare function lerp(a: number, b: number, t: number): number;
/**
 * Shortest-path linear interpolation of angles in degrees. Prevents the
 * long-way-around behaviour when crossing the ±180° boundary.
 */
declare function lerpAngleDeg(a: number, b: number, t: number): number;
/**
 * Lerps two nullable channel values. If either side is null, the non-null
 * value is returned (no fade in/out). If both are null, returns null.
 */
declare function lerpNullable(a: number | null, b: number | null, t: number): number | null;
//#endregion
//#region src/engine/property-resolver.d.ts
/** Static identity pose — used when an element has no keyframes in a state. */
declare function identityResolved(el: AnimatedElement): ResolvedElement;
/** Pose that exactly matches a single keyframe's values. */
declare function resolvedFromKeyframe(kf: Keyframe, el: AnimatedElement): ResolvedElement;
/**
 * Resolves [el]'s animated values at [localTimeMs] within [stateName].
 *
 * When any keyframe carries a `props` declaration, per-channel interpolation
 * is used: each property finds its own bracketing keyframes that declare it.
 * Legacy keyframes (props == null) declare all channels, preserving
 * backwards-compatible behaviour.
 */
declare function resolveElement(el: AnimatedElement, stateName: string, localTimeMs: number): ResolvedElement;
/** Blends from → to by t in [0, 1]. Used during state transitions. */
declare function blendResolved(from: ResolvedElement, to: ResolvedElement, t: number): ResolvedElement;
//#endregion
//#region src/engine/controller.d.ts
interface ControllerOptions {
  /** State to start in. Defaults to `animation.defaultState`. */
  initialState?: string;
  /** Playback mode. Default 'loop'. */
  mode?: PlaybackMode;
  /** Speed multiplier. Default 1.0. */
  speed?: number;
  /** If true, the controller starts in the playing state. Default true. */
  autoplay?: boolean;
}
type Listener = () => void;
interface StateChangeEvent {
  readonly from: string;
  readonly to: string;
}
type StateChangeHandler = (event: StateChangeEvent) => void;
/**
 * Mutable playback state for a [VectorAnimation].
 *
 * The controller does not own a clock — call [advance] once per frame with
 * the elapsed delta (typically from a `requestAnimationFrame` loop). After
 * each advance, listeners registered via [addListener] are notified so
 * downstream renderers can repaint.
 */
declare class VectorAnimateController {
  readonly animation: VectorAnimation;
  mode: PlaybackMode;
  speed: number;
  private _currentState;
  private _stateTimeMs;
  private _isPlaying;
  private _direction;
  /** Monotonic clock advanced unconditionally each tick. Used as "now" for
   *  binding settling, which keeps progressing even when playback is paused. */
  private _wallClockMs;
  private _inTransition;
  private _isFadeTransition;
  private _transitionElapsedMs;
  private _transitionMaxDurationMs;
  private _transitionFadeDurationMs;
  private _activeTransition;
  private _snapshot;
  /** Recorded at setState time so `onStateTransitionEnd` knows the prior state. */
  private _transitionFromState;
  private _dataValues;
  private _bindingState;
  /** Forces a repaint on the next advance even when nothing else changed. */
  private _bindingDirty;
  private _listeners;
  private _stateChangeHandlers;
  private _stateTransitionEndHandlers;
  constructor(animation: VectorAnimation, options?: ControllerOptions);
  get currentState(): string;
  get position(): number;
  get isPlaying(): boolean;
  get isInTransition(): boolean;
  /** Global opacity for the fade-in effect when the active state's
   *  transitionIn type is `fade`. Returns 1.0 when no fade is in progress. */
  get transitionInFadeOpacity(): number;
  play(): void;
  pause(): void;
  /** Pauses and rewinds the active state to its windowIn. */
  stop(): void;
  /** Jumps to [ms] within the active state, clamped to [windowIn, windowOut]. */
  seekTo(ms: number): void;
  /**
   * Switches to [targetState]. No-op when already in that state and not mid-
   * transition. Throws if [targetState] is not declared in the animation.
   * Fires `onStateChange` synchronously.
   */
  setState(targetState: string): void;
  /**
   * Pushes an external value into the animation. Any binding whose `dataKey`
   * matches retargets toward the new value over its `settlingMs`. Settlement
   * continues even while playback is paused.
   */
  setData(key: string, value: number): void;
  /** Bulk variant of [setData]; fires a single notification. */
  setDataMap(values: Record<string, number>): void;
  /**
   * Removes the data value for [key] and discards any in-flight settle state
   * for bindings using it. Subsequent frames render those bindings as if no
   * external value had been set (i.e. keyframe values take over).
   */
  clearData(key: string): void;
  /** Returns the last value passed to [setData] for [key], or undefined. */
  getData(key: string): number | undefined;
  /** Iterable over all keys currently set via [setData] / [setDataMap]. */
  get dataKeys(): IterableIterator<string>;
  /** All `DataBinding.dataKey`s declared by the animation. */
  get declaredDataKeys(): Set<string>;
  /**
   * Snapshot of every state declared by the animation. Result order matches
   * `animation.states`. Use this to populate state pickers, debug overlays,
   * or to discover which states have shorter playback windows.
   */
  listStates(): StateInfo[];
  /** Looks up a single state's metadata by name. Undefined if unknown. */
  getStateInfo(name: string): StateInfo | undefined;
  /**
   * Every `DataBinding` declared in the animation, decorated with the id of
   * the element that owns it. Result order matches `animation.elementOrder`,
   * then per-element `dataBindings` order.
   */
  listBindings(): DataBindingInfo[];
  /**
   * Every distinct `DataBinding.dataKey` declared in the animation, the
   * bindings that consume each key, and the controller's current value for
   * that key (if any). Order is first-seen during element iteration.
   */
  listDataKeys(): DataKeyInfo[];
  private _setDataKey;
  private _retargetBinding;
  private _evalBinding;
  private _evalBindingCurrent;
  private _anyBindingSettling;
  /**
   * Advances the playback clock by [dtMs] milliseconds. Typically called from
   * a `requestAnimationFrame` loop with the per-frame delta. Notifies listeners
   * if this tick produces a new pose.
   */
  advance(dtMs: number): void;
  private _advanceStateClock;
  /** Computes the resolved pose for every element at the current frame. */
  resolveAll(): Map<string, ResolvedElement>;
  private _applyTransition;
  private _applyBindings;
  /** Registers a listener that fires whenever playback state changes.
   *  Returns an unsubscribe function. */
  addListener(fn: Listener): () => void;
  removeListener(fn: Listener): void;
  /** Fires synchronously inside [setState]. Returns an unsubscribe function. */
  onStateChange(handler: StateChangeHandler): () => void;
  /** Fires when a state transition's blend completes. Returns an unsubscribe. */
  onStateTransitionEnd(handler: StateChangeHandler): () => void;
  protected _notify(): void;
  private _fireStateChange;
  private _fireStateTransitionEnd;
  /** Releases listeners. Call when the controller is no longer in use. */
  dispose(): void;
}
//#endregion
//#region src/engine/data-binding.d.ts
/** True for `fill` and `stroke` (color-typed bindings); false for scalars. */
declare function isColorProperty(p: BoundProperty): boolean;
/**
 * Maps an external scalar value through a binding's clamped linear mapping.
 *
 *   raw → clamp((raw - inMin) / (inMax - inMin), 0, 1) → outMin..outMax
 */
declare function mapScalar(b: DataBinding, raw: number): number;
/**
 * Maps an external scalar value through a colour binding's ARGB lerp.
 * Null endpoints fall back to opaque black / opaque white.
 */
declare function mapColor(b: DataBinding, raw: number): number;
/** Component-wise lerp of two ARGB integers (alpha included). */
declare function argbLerp(a: number, b: number, t: number): number;
//#endregion
//#region src/render/box-fit.d.ts
/** Mirrors Flutter's BoxFit. Default is `contain`. */
type BoxFit = 'contain' | 'cover' | 'fill' | 'fitWidth' | 'fitHeight' | 'scaleDown' | 'none';
/**
 * Applies a BoxFit transform to [ctx], mapping the SVG viewport into a target
 * rectangle of `(cssW, cssH)` CSS pixels. Caller must `save()` first; this
 * function does not touch save/restore state.
 */
declare function applyBoxFit(ctx: CanvasRenderingContext2D, fit: BoxFit, cssW: number, cssH: number, vp: Viewport): void;
//#endregion
//#region src/render/animation-renderer.d.ts
interface RendererOptions {
  /** Default 'contain'. */
  boxFit?: BoxFit;
  /**
   * Controls the warm-up paint cycle (one synchronous frame before the RAF
   * loop starts, so V8 JIT-compiles the hot paint path before it runs under
   * frame budget pressure).
   *
   * Precedence:
   *   - Explicit `true` / `false` → always wins.
   *   - Omitted → defers to the .var file's `runtimeHints.warmUp` flag
   *     (default `true` when no hints are present). This lets the designer's
   *     runtime-export modal disable warm-up for animations that bake enough
   *     work upstream to make it unnecessary.
   */
  warmUp?: boolean;
}
/**
 * Renders a [VectorAnimateController]'s current pose into an HTML <canvas>.
 *
 * Owns a `requestAnimationFrame` loop while [start]ed; each tick advances the
 * controller and repaints the canvas. Uses the canvas's CSS pixel size
 * (`clientWidth` / `clientHeight`) and scales the context by
 * `devicePixelRatio` for crisp rendering on retina displays. A
 * `ResizeObserver` keeps the bitmap size in sync with the CSS size.
 */
declare class AnimationRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly controller: VectorAnimateController;
  boxFit: BoxFit;
  private _ctx;
  private _dpr;
  private _cssWidth;
  private _cssHeight;
  private _rafId;
  private _lastTickMs;
  private _resizeObserver;
  /** undefined = defer to the file's runtimeHints.warmUp on first start(). */
  private _warmUpOption;
  private _warmUpDone;
  constructor(canvas: HTMLCanvasElement, controller: VectorAnimateController, options?: RendererOptions);
  /** Begins the RAF loop. No-op if already running. */
  start(): void;
  /** Stops the RAF loop. The canvas keeps its last frame. */
  stop(): void;
  /** Forces a single repaint without advancing the controller. */
  paint(): void;
  /** Stops the RAF loop and disconnects the ResizeObserver. */
  dispose(): void;
  private _syncCanvasSize;
  private _paint;
}
//#endregion
//#region src/render/paint.d.ts
/**
 * Resolves an SvgPaint to a value assignable to `ctx.fillStyle` / `strokeStyle`.
 * For solid colours this is a CSS rgba() string; for gradients it is a
 * CanvasGradient created on [ctx].
 *
 * `bounds` is the geometry's local-space bbox, used to map gradients in
 * `objectBoundingBox` mode. May be null when no geometry was registered.
 */
declare function resolvePaint(ctx: CanvasRenderingContext2D, paint: SvgPaint, bounds: Bounds | null): string | CanvasGradient;
//#endregion
//#region src/player.d.ts
/** Source the player can construct from. */
type PlayerSource = string | Uint8Array | VectorAnimation | Record<string, unknown>;
interface PlayerOptions {
  /** State to start in. Defaults to `animation.defaultState`. */
  initialState?: string;
  /** Playback mode. Default 'loop'. */
  mode?: PlaybackMode;
  /** Speed multiplier. Default 1.0. */
  speed?: number;
  /** If true, the controller starts playing. Default true. */
  autoplay?: boolean;
  /** Renderer fit mode. Default 'contain'. */
  boxFit?: BoxFit;
}
/** Events emitted by the player's `on()` method. */
type PlayerEvent = 'stateChange' | 'stateTransitionEnd';
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
declare class VectorAnimatePlayer {
  readonly canvas: HTMLCanvasElement;
  readonly animation: VectorAnimation;
  readonly controller: VectorAnimateController;
  readonly renderer: AnimationRenderer;
  /**
   * Async factory: resolves [source] to a `VectorAnimation`, builds the
   * controller + renderer, and starts the RAF loop.
   */
  static create(canvas: HTMLCanvasElement, source: PlayerSource, options?: PlayerOptions): Promise<VectorAnimatePlayer>;
  constructor(canvas: HTMLCanvasElement, animation: VectorAnimation, options?: PlayerOptions);
  play(): void;
  pause(): void;
  stop(): void;
  seekTo(ms: number): void;
  setState(state: string): void;
  get currentState(): string;
  get position(): number;
  get isPlaying(): boolean;
  get isInTransition(): boolean;
  get mode(): PlaybackMode;
  set mode(value: PlaybackMode);
  get speed(): number;
  set speed(value: number);
  get boxFit(): BoxFit;
  set boxFit(value: BoxFit);
  setData(key: string, value: number): void;
  setDataMap(values: Record<string, number>): void;
  clearData(key: string): void;
  getData(key: string): number | undefined;
  get dataKeys(): IterableIterator<string>;
  get declaredDataKeys(): Set<string>;
  /** Snapshot of every state declared by the animation. */
  listStates(): StateInfo[];
  /** Looks up a single state's metadata by name. */
  getStateInfo(name: string): StateInfo | undefined;
  /** Every declared `DataBinding`, decorated with its owning element's id. */
  listBindings(): DataBindingInfo[];
  /** Every distinct data key, the bindings that consume it, and its current value. */
  listDataKeys(): DataKeyInfo[];
  /**
   * Subscribes to a typed player event. Returns an unsubscribe function.
   * Equivalent to calling the matching method on `controller` directly.
   */
  on(event: PlayerEvent, handler: StateChangeHandler): () => void;
  /** Stops RAF, releases listeners, disconnects the resize observer. */
  dispose(): void;
}
//#endregion
export { type AnimatedElement, AnimationRenderer, type BoundProperty, type Bounds, type BoxFit, type ControllerOptions, type DataBinding, type DataBindingInfo, type DataKeyInfo, type EasingCurve, type ElementAnimation, type ElementTransitionOverride, IDENTITY, type Keyframe, type LinearGradientPaint, type Listener, type Matrix2D, type PlaybackMode, type PlayerEvent, type PlayerOptions, type PlayerSource, type RadialGradientPaint, type RendererOptions, type ResolvedElement, type SceneNode, type SolidPaint, type SpreadMethod, type StateChangeEvent, type StateChangeHandler, type StateConfig, type StateInfo, type StateTransition, type SvgPaint, type TransitionDefaults, type TransitionInConfig, type TransitionInType, VarLoader, VectorAnimateController, VectorAnimatePlayer, type VectorAnimation, type Viewport, applyBoxFit, applyEasing, argbLerp, argbToCss, blendResolved, identityResolved, isColorProperty, isIdentity, lerp, lerpAngleDeg, lerpNullable, mapColor, mapScalar, multiplyMatrices, parseCssColorToArgb, parseSvg, resolveElement, resolvePaint, resolvedFromKeyframe };
//# sourceMappingURL=index.d.cts.map