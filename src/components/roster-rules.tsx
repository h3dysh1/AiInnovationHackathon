import { useState } from 'react';
import { Button, Disclosure, Field, Notice } from './ui';
import type { RestRules } from '@/domain/roster-rest';
import { setupRpc } from '@/services/planning';

export function RosterRules({ eventId, rules, disabled, save }: { eventId: string; rules?: RestRules | null; disabled: boolean; save: (action: () => Promise<unknown>) => Promise<unknown> }) {
  const [rest, setRest] = useState<string | null>(null), [pause, setPause] = useState<string | null>(null), [continuous, setContinuous] = useState<string | null>(null);
  const values = [rest ?? String(rules?.minimum_rest_hours ?? 0), pause ?? String(rules?.minimum_break_minutes ?? 30), continuous ?? String(rules?.maximum_continuous_hours ?? 0)];
  return <Disclosure title='Rest and break rules'>
    <Notice message='Rules apply to generated and manually assigned rosters. Rest is the gap between shifts starting on different work days. A sufficient gap between shifts resets continuous work. Zero disables a rest or continuous-work limit. These controls do not create staffed breaks within a shift; split shifts and cover those gaps explicitly.' />
    <Field label='Minimum rest between work days (hours)' value={values[0]} onChangeText={setRest} keyboardType='decimal-pad' />
    <Field label='Break needed to reset continuous work (minutes)' value={values[1]} onChangeText={setPause} keyboardType='number-pad' />
    <Field label='Maximum continuous work (hours)' value={values[2]} onChangeText={setContinuous} keyboardType='decimal-pad' />
    <Button title='Save roster rules' secondary disabled={disabled} onPress={() => { void save(async () => {
      if (values.some(v => !v.trim() || !Number.isFinite(Number(v)))) throw new Error('Enter valid rest and break limits.');
      await setupRpc('set_roster_rules', { p_event_id: eventId, p_rest: Number(values[0]), p_break: Number(values[1]), p_continuous: Number(values[2]) });
    }); }} />
  </Disclosure>;
}
