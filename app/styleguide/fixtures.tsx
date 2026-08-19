import type { ReactElement } from 'react';
import { Card } from '@/components/ui/Card';
import { CardWithEyebrow } from '@/components/ui/CardWithEyebrow';
import { CountBadge } from '@/components/ui/CountBadge';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { TagChip } from '@/components/ui/TagChip';
import { RemovableChip } from '@/components/ui/RemovableChip';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Avatar, AvatarStack } from '@/components/ui/Avatar';
import { Legend } from '@/components/ui/Legend';
import { Icon } from '@/components/icons/Icon';
import { CalendarNumeral } from '@/components/ui/CalendarNumeral';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProvenanceLine } from '@/components/ui/ProvenanceLine';

/**
 * The styleguide fixtures (Q4): every component in composition. Three
 * consumers — the /styleguide page (the human review surface for the four
 * §8.1 colour rules), D7's axe leg (every composition scanned), and
 * whatever slice builds next (the living reference). Fixture data is
 * demonstration copy only — never real family data.
 */
export const STYLEGUIDE_FIXTURES: Array<{
  name: string;
  render: () => ReactElement;
}> = [
  {
    name: 'Card',
    render: () => (
      <Card>
        <span className="row-title">A plain card</span>
        <p className="meta">Borders do the work — no shadow, no lift.</p>
      </Card>
    ),
  },
  {
    name: 'Card with eyebrow',
    render: () => (
      <CardWithEyebrow
        accent="sage"
        eyebrow="Handled"
        headline="Everything is filed"
        explanation="Three lines, that order, no icon."
      />
    ),
  },
  {
    name: 'Count badge',
    render: () => (
      <p className="meta">
        3 in the Care Inbox <CountBadge count={3} />
      </p>
    ),
  },
  {
    name: 'Category badge',
    render: () => <CategoryBadge accent="amber">Insurance</CategoryBadge>,
  },
  {
    name: 'Tag chip',
    render: () => <TagChip>encouraging</TagChip>,
  },
  {
    name: 'Removable chip',
    render: () => <RemovableChip label="Denver General" />,
  },
  {
    name: 'Buttons',
    render: () => (
      <p>
        <Button>Save changes</Button> <Button variant="secondary">Copy</Button>{' '}
        <Button variant="quiet">Not now</Button>
      </p>
    ),
  },
  {
    name: 'Field and input',
    render: () => (
      <Field label="First name" help="As they like to be called.">
        <Input name="demo_first_name" />
      </Field>
    ),
  },
  {
    name: 'Composed control',
    render: () => (
      // §8.4: the label sits OUTSIDE the shared shell; the input drops
      // its own border and sits borderless INSIDE it (the zip-field
      // pattern). Association rides aria-labelledby — the shell is a
      // div, so nesting a label around it would be invalid markup.
      <div className="field">
        <span className="field-label" id="demo-zip-label">
          Zip code
        </span>
        <div className="composed-control">
          <Input
            name="demo_zip"
            inputMode="numeric"
            aria-labelledby="demo-zip-label"
          />
        </div>
      </div>
    ),
  },
  {
    name: 'Avatars',
    render: () => (
      <AvatarStack>
        <Avatar name="Nell" accent="plum" />
        <Avatar name="Sarah" accent="sage" />
        <Avatar name="Dan" accent="terracotta" />
      </AvatarStack>
    ),
  },
  {
    name: 'Legend',
    render: () => (
      <Legend
        items={[
          { accent: 'terracotta', label: 'Needs you' },
          { accent: 'amber', label: 'Due' },
          { accent: 'sage', label: 'Handled' },
        ]}
      />
    ),
  },
  {
    name: 'Calendar numeral',
    render: () => <CalendarNumeral date="2026-07-12" />,
  },
  {
    name: 'Empty state',
    render: () => <EmptyState>Nothing on the books for this month.</EmptyState>,
  },
  {
    name: 'Provenance line',
    render: () => (
      <ProvenanceLine>From the discharge summary · page 2</ProvenanceLine>
    ),
  },
  {
    name: 'Motion',
    render: () => (
      <p className="meta">
        <span
          className="pulse-amber"
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--amber)',
          }}
        />{' '}
        the one pulse per screen (hp · 2.2s ease-out) — register real pulses
        through usePulse() under &lt;PulseProvider&gt;.
      </p>
    ),
  },
  {
    name: 'Icon conventions',
    render: () => (
      <p className="meta">
        <Icon>
          <path d="M12 5v14M5 12h14" />
        </Icon>{' '}
        24×24 viewBox · stroke 1.6 · round caps — the base product glyphs
        land on with their surfaces.
      </p>
    ),
  },
];
