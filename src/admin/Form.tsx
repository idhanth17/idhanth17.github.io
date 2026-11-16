import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../components/Icons';
import type { Field } from './schema';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FormContext {
  /** Stage a file for the next publish and return the site path it will live at. */
  upload: (file: File, opts: { kind: 'image' | 'file'; target?: string }) => Promise<string>;
  /** A displayable URL for a content image path (staged uploads resolve to data URLs). */
  preview: (path: string) => string;
}

interface Props {
  fields: Field[];
  value: any;
  onChange: (next: any) => void;
  ctx: FormContext;
}

export function Fields({ fields, value, onChange, ctx }: Props) {
  const v = value ?? {};
  return (
    <div className="ad-fields">
      {fields.map((f) => (
        <FieldView key={f.key} field={f} value={v[f.key]} onChange={(next) => onChange({ ...v, [f.key]: next })} ctx={ctx} />
      ))}
    </div>
  );
}

function Label({ id, field }: { id?: string; field: { label: string; help?: string } }) {
  return (
    <>
      <label className="ad-label" htmlFor={id}>
        {field.label}
      </label>
      {field.help && <p className="ad-help">{field.help}</p>}
    </>
  );
}

function FieldView({ field, value, onChange, ctx }: { field: Field; value: any; onChange: (next: any) => void; ctx: FormContext }) {
  const id = useId();
  switch (field.kind) {
    case 'text':
      return (
        <div className="ad-field">
          <Label id={id} field={field} />
          <input id={id} className="ad-input" type="text" value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'textarea':
      return (
        <div className="ad-field">
          <Label id={id} field={field} />
          <textarea id={id} className="ad-input ad-textarea" rows={field.rows ?? 3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'number':
      return (
        <div className="ad-field ad-field-short">
          <Label id={id} field={field} />
          <input
            id={id}
            className="ad-input"
            type="number"
            step={field.step ?? 'any'}
            value={Number.isFinite(value) ? value : 0}
            onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          />
        </div>
      );
    case 'toggle':
      return (
        <div className="ad-field">
          <label className="ad-toggle">
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
            <span className="ad-toggle-track" aria-hidden="true" />
            <span>{field.label}</span>
          </label>
          {field.help && <p className="ad-help">{field.help}</p>}
        </div>
      );
    case 'select':
      return (
        <div className="ad-field ad-field-short">
          <Label id={id} field={field} />
          <select id={id} className="ad-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'tags':
      return <TagsField id={id} field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />;
    case 'lines':
      return <LinesField field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />;
    case 'image':
      return <UploadField id={id} field={field} value={value ?? ''} onChange={onChange} ctx={ctx} kind="image" accept="image/*" />;
    case 'file':
      return <UploadField id={id} field={field} value={value ?? ''} onChange={onChange} ctx={ctx} kind="file" accept={field.accept} target={field.target} />;
    case 'group':
      return (
        <fieldset className="ad-group">
          <legend>{field.label}</legend>
          {field.help && <p className="ad-help">{field.help}</p>}
          <Fields fields={field.fields} value={value} onChange={onChange} ctx={ctx} />
        </fieldset>
      );
    case 'list':
      return <ListField field={field} value={Array.isArray(value) ? value : []} onChange={onChange} ctx={ctx} />;
  }
}

function TagsField({ id, field, value, onChange }: { id: string; field: Extract<Field, { kind: 'tags' }>; value: string[]; onChange: (next: string[]) => void }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const next = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !value.includes(s));
    if (next.length) onChange([...value, ...next]);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && text === '' && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="ad-field">
      <Label id={id} field={field} />
      <div className="ad-tags">
        {value.map((t, i) => (
          <span key={t + i} className="ad-tag">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        <input id={id} type="text" value={text} placeholder={value.length ? 'Add…' : 'Type and press Enter'} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={() => text.trim() && add(text)} />
      </div>
    </div>
  );
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function RowTools({ index, count, onMove, onRemove, what }: { index: number; count: number; onMove: (to: number) => void; onRemove: () => void; what: string }) {
  return (
    <span className="ad-row-tools">
      <button type="button" className="ad-mini" aria-label={`Move ${what} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>
        ↑
      </button>
      <button type="button" className="ad-mini" aria-label={`Move ${what} down`} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
        ↓
      </button>
      <button type="button" className="ad-mini ad-mini-danger" aria-label={`Remove ${what}`} onClick={onRemove}>
        <Icon name="close" size={13} />
      </button>
    </span>
  );
}

function LinesField({ field, value, onChange }: { field: Extract<Field, { kind: 'lines' }>; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="ad-field">
      <Label field={field} />
      <div className="ad-lines">
        {value.map((line, i) => (
          <div className="ad-line" key={i}>
            <textarea
              className="ad-input ad-textarea"
              rows={field.rows ?? 2}
              value={line}
              aria-label={`${field.label} ${i + 1}`}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <RowTools index={i} count={value.length} what="line" onMove={(to) => onChange(move(value, i, to))} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <button type="button" className="ad-add" onClick={() => onChange([...value, ''])}>
        <Icon name="plus" size={14} /> {field.addLabel ?? 'Add'}
      </button>
    </div>
  );
}

function ListField({ field, value, onChange, ctx }: { field: Extract<Field, { kind: 'list' }>; value: any[]; onChange: (next: any[]) => void; ctx: FormContext }) {
  const [open, setOpen] = useState<number | null>(null);
  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    onChange(move(value, from, to));
    setOpen((o) => (o === from ? to : o === to ? from : o));
  };
  const remove = (i: number) => {
    const name = field.title(value[i], i);
    if (!window.confirm(`Remove “${name}”?`)) return;
    onChange(value.filter((_, j) => j !== i));
    setOpen(null);
  };
  return (
    <div className="ad-field">
      <Label field={field} />
      <div className="ad-list">
        {value.length === 0 && <p className="ad-empty">Nothing here yet.</p>}
        {value.map((item, i) => {
          const isOpen = open === i;
          return (
            <div className="ad-item" key={i} data-open={isOpen || undefined}>
              <div className="ad-item-head">
                <button type="button" className="ad-item-title" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
                  <span className="ad-caret" aria-hidden="true">
                    ›
                  </span>
                  <span>{field.title(item, i)}</span>
                </button>
                <RowTools index={i} count={value.length} what="item" onMove={(to) => reorder(i, to)} onRemove={() => remove(i)} />
              </div>
              {isOpen && (
                <div className="ad-item-body">
                  <Fields fields={field.fields} value={item} onChange={(next) => onChange(value.map((x, j) => (j === i ? next : x)))} ctx={ctx} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="ad-add"
        onClick={() => {
          onChange([...value, field.blank()]);
          setOpen(value.length);
        }}
      >
        <Icon name="plus" size={14} /> {field.addLabel}
      </button>
    </div>
  );
}

function UploadField({
  id,
  field,
  value,
  onChange,
  ctx,
  kind,
  accept,
  target,
}: {
  id: string;
  field: { label: string; help?: string };
  value: string;
  onChange: (next: string) => void;
  ctx: FormContext;
  kind: 'image' | 'file';
  accept: string;
  target?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await ctx.upload(file, { kind, target }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="ad-field">
      <Label id={id} field={field} />
      <div className="ad-upload">
        {kind === 'image' && value && <img src={ctx.preview(value)} alt="" />}
        <input id={id} className="ad-input" type="text" value={value} placeholder={kind === 'image' ? '/uploads/photo.jpg or https://…' : '/resume.pdf'} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="ad-btn" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Reading…' : 'Upload…'}
        </button>
        {value && (
          <button type="button" className="ad-btn" onClick={() => onChange('')}>
            Clear
          </button>
        )}
        <input ref={input} type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {error && <p className="ad-error">{error}</p>}
    </div>
  );
}
