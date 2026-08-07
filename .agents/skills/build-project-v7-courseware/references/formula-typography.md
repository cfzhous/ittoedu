# Formula and subject typography

## Principle

Store mathematical meaning independently from a font shortcut. A Unicode diagonal fraction is a glyph, not a stacked fraction layout.

## Fractions

For display fractions, use a structured representation such as:

```html
<span class="formula" data-formula-id="FORM-001" aria-label="one half times a times b">
  <span class="frac">
    <span class="frac-num">1</span>
    <span class="frac-den">2</span>
  </span>
  <span aria-hidden="true">·</span><i>a</i><span aria-hidden="true">·</span><i>b</i>
</span>
```

```css
.frac {
  display: inline-grid;
  grid-template-rows: auto auto;
  align-items: center;
  vertical-align: -0.35em;
  line-height: 1;
  text-align: center;
}
.frac-num { border-bottom: 0.075em solid currentColor; padding: 0 0.16em 0.08em; }
.frac-den { padding: 0.08em 0.16em 0; }
```

Equivalent native text/shape groups are valid when they preserve editability and export quality. Do not inject untrusted raw HTML into editable content. Prefer structured formula data or a fixed renderer that binds numerator/denominator text separately.

Prohibit display uses of:

- `½`, `⅓`, `¼`, and Unicode range U+2150–U+215E;
- `1/2`, `a/b`, or slash text used as a visual substitute for a stacked fraction;
- a screenshot-only formula without a source/editability record.

Inline slash notation remains valid only when the approved content explicitly intends linear notation, such as a ratio, unit, URL, or source-code expression.

## Other structures

- Use real superscript/subscript layout for powers and indices.
- Distinguish the radical sign and radicand; avoid a loose `√` glyph with ambiguous scope.
- Draw vector arrows, function graphs, coordinate axes, piecewise braces, matrices, and geometric labels according to the content specification.
- Keep units upright and consistent; keep variables and operators distinguishable.
- Provide accessible text describing the semantic formula.

## Verification

For every Formula ID:

1. inspect actual HTML at 1280×720;
2. inspect keyboard focus/reading behavior when interactive;
3. capture PDF and PPTX renderings;
4. compare numerator/denominator alignment, line weight, baseline, size, clipping, and contrast;
5. verify edits update the same semantic source and do not leave a stale fallback.

Static scanning is a guardrail, not visual acceptance.
