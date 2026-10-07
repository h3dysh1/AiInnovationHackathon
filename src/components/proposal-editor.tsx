import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Field } from './ui';
import { PlanCard, planStyles, SourceLabel } from './plan-ui';
import type { OperatingPlan, Source } from '@/domain/operating-plan';
import type { PlanningSnapshot } from '@/services/planning';
const manual: Source = {
  sourceType: 'manual',
  sourceId: null,
  reference: 'Coordinator edited the candidate before applying',
  confidence: 1,
};
const count = (value: string) => value.trim() === '' ? null : Number(value);
export function ProposalEditor(
  { value, onChange, snapshot, disabled }: {
    value: OperatingPlan;
    onChange: (p: OperatingPlan) => void;
    snapshot: PlanningSnapshot;
    disabled: boolean;
  },
) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <Text style={planStyles.heading}>Candidate locations · {value.locations.length}</Text>
      {value.locations.map((l, i) => (
        <PlanCard key={l.key}>
          <Text style={planStyles.heading}>{l.name}</Text>
          <SourceLabel source={l.source} snapshot={snapshot} />
          {editing === l.key
            ? (
              <>
                <Field
                  label='Location name'
                  value={l.name}
                  onChangeText={(name) =>
                    onChange({
                      ...value,
                      locations: value.locations.map((x, n) =>
                        n === i ? { ...x, name, source: manual } : x
                      ),
                    })}
                />
                <Field
                  label='Description'
                  value={l.description}
                  multiline
                  onChangeText={(description) =>
                    onChange({
                      ...value,
                      locations: value.locations.map((x, n) =>
                        n === i ? { ...x, description, source: manual } : x
                      ),
                    })}
                />
              </>
            )
            : null}
          <Button
            title={editing === l.key ? 'Close editor' : 'Edit location'}
            secondary
            disabled={disabled}
            onPress={() => setEditing(editing === l.key ? null : l.key)}
          />
        </PlanCard>
      ))}
      <Text style={planStyles.heading}>Candidate posts · {value.posts.length}</Text>
      {value.posts.map((p, i) => {
        const update = (fields: Partial<typeof p>) =>
          onChange({
            ...value,
            posts: value.posts.map((x, n) => n === i ? { ...x, ...fields, source: manual } : x),
          });
        const location = value.locations.find((l) => l.key === p.locationKey)?.name ??
          snapshot.locations.find((l) => l.id === p.locationKey)?.name ?? 'Unknown location';
        return (
          <PlanCard key={p.key}>
            <Text style={planStyles.heading}>{p.name} · {location}</Text>
            <Text style={planStyles.text}>
              {p.minimumCoverage ?? 'Unknown'} total volunteers · {p.criticality}
            </Text>
            <Text style={planStyles.text}>
              Supervisor: {p.supervisor ?? 'Missing'}
              {'\n'}Escalation: {p.escalation ?? 'Missing'}
            </Text>
            {p.requirements.map((r, n) => (
              <Text key={n} style={planStyles.text}>
                {r.minimumCount ?? '?'} × {r.certificationType ?? r.experienceRequirement}{' '}
                (within total staffing)
              </Text>
            ))}
            {p.windows.map((w, n) => (
              <Text key={n} style={planStyles.text}>
                {w.startDate ?? '?'}–{w.endDate ?? '?'} · {w.startTime ?? '?'}–{w.endTime ?? '?'} ·
                {' '}
                {w.minimumCoverage ?? p.minimumCoverage ?? '?'} volunteers
              </Text>
            ))}
            <SourceLabel source={p.source} snapshot={snapshot} />
            {editing === p.key
              ? (
                <>
                  <Field
                    label='Post name'
                    value={p.name}
                    onChangeText={(name) => update({ name })}
                  />
                  <Field
                    label='Description'
                    value={p.description}
                    multiline
                    onChangeText={(description) => update({ description })}
                  />
                  <Text style={planStyles.help}>Location</Text>
                  {[
                    ...value.locations.map((l) => ({ key: l.key, name: l.name })),
                    ...snapshot.locations.map((l) => ({ key: l.id, name: l.name })),
                  ].map((l) => (
                    <Button
                      key={l.key}
                      title={`${p.locationKey === l.key ? '✓ ' : ''}${l.name}`}
                      secondary
                      onPress={() => update({ locationKey: l.key })}
                    />
                  ))}
                  <Field
                    label='Total minimum volunteers'
                    value={p.minimumCoverage?.toString() ?? ''}
                    keyboardType='number-pad'
                    onChangeText={(v) => update({ minimumCoverage: count(v) })}
                  />
                  <Field
                    label='Supervisor'
                    value={p.supervisor ?? ''}
                    onChangeText={(v) => update({ supervisor: v.trim() ? v : null })}
                  />
                  <Field
                    label='Escalation contact'
                    value={p.escalation ?? ''}
                    onChangeText={(v) => update({ escalation: v.trim() ? v : null })}
                  />
                  {(['normal', 'important', 'critical'] as const).map((c) => (
                    <Button
                      key={c}
                      title={`${p.criticality === c ? '✓ ' : ''}${c}`}
                      secondary
                      onPress={() => update({ criticality: c })}
                    />
                  ))}
                  <Field
                    label='Instructions'
                    value={p.instructions}
                    multiline
                    onChangeText={(instructions) => update({ instructions })}
                  />
                  {p.requirements.map((r, n) => (
                    <PlanCard key={n}>
                      <Field
                        label='Certification'
                        value={r.certificationType ?? ''}
                        onChangeText={(v) =>
                          update({
                            requirements: p.requirements.map((x, k) =>
                              k === n ? { ...x, certificationType: v || null } : x
                            ),
                          })}
                      />
                      <Field
                        label='Experience'
                        value={r.experienceRequirement ?? ''}
                        onChangeText={(v) =>
                          update({
                            requirements: p.requirements.map((x, k) =>
                              k === n ? { ...x, experienceRequirement: v || null } : x
                            ),
                          })}
                      />
                      <Field
                        label='Qualified volunteers within total'
                        value={r.minimumCount?.toString() ?? ''}
                        keyboardType='number-pad'
                        onChangeText={(v) =>
                          update({
                            requirements: p.requirements.map((x, k) =>
                              k === n ? { ...x, minimumCount: count(v) } : x
                            ),
                          })}
                      />
                      <Button
                        title='Remove candidate requirement'
                        secondary
                        onPress={() =>
                          update({ requirements: p.requirements.filter((_, k) => k !== n) })}
                      />
                    </PlanCard>
                  ))}
                  <Button
                    title='Add qualification'
                    secondary
                    onPress={() =>
                      update({
                        requirements: [...p.requirements, {
                          certificationType: null,
                          experienceRequirement: null,
                          minimumCount: 1,
                        }],
                      })}
                  />
                  {p.windows.map((w, n) => (
                    <PlanCard key={n}>
                      {(['startDate', 'endDate', 'startTime', 'endTime'] as const).map((field) => (
                        <Field
                          key={field}
                          label={`${field} (${field.includes('Date') ? 'YYYY-MM-DD' : 'HH:MM'})`}
                          value={w[field] ?? ''}
                          onChangeText={(v) =>
                            update({
                              windows: p.windows.map((x, k) =>
                                k === n ? { ...x, [field]: v || null } : x
                              ),
                            })}
                        />
                      ))}
                      <Field
                        label='Staffing override (blank uses post minimum)'
                        value={w.minimumCoverage?.toString() ?? ''}
                        keyboardType='number-pad'
                        onChangeText={(v) =>
                          update({
                            windows: p.windows.map((x, k) =>
                              k === n ? { ...x, minimumCoverage: count(v) } : x
                            ),
                          })}
                      />
                      <Button
                        title='Remove candidate window'
                        secondary
                        onPress={() => update({ windows: p.windows.filter((_, k) => k !== n) })}
                      />
                    </PlanCard>
                  ))}
                  <Button
                    title='Add operating window'
                    secondary
                    onPress={() =>
                      update({
                        windows: [...p.windows, {
                          startDate: snapshot.event.start_date,
                          endDate: snapshot.event.end_date,
                          startTime: null,
                          endTime: null,
                          minimumCoverage: null,
                        }],
                      })}
                  />
                </>
              )
              : null}
            <Button
              title={editing === p.key ? 'Close editor' : 'Edit candidate post'}
              disabled={disabled}
              secondary
              onPress={() => setEditing(editing === p.key ? null : p.key)}
            />
          </PlanCard>
        );
      })}
      <Text style={planStyles.heading}>Candidate procedures · {value.procedures.length}</Text>
      {value.procedures.map((p, i) => (
        <PlanCard key={p.key}>
          <Text style={planStyles.heading}>{p.title}</Text>
          <Text style={planStyles.text}>{p.content}</Text>
          <SourceLabel source={p.source} snapshot={snapshot} />
          {editing === p.key
            ? (
              <>
                <Field
                  label='Procedure title'
                  value={p.title}
                  onChangeText={(title) =>
                    onChange({
                      ...value,
                      procedures: value.procedures.map((x, n) =>
                        n === i ? { ...x, title, source: manual } : x
                      ),
                    })}
                />
                <Field
                  label='Procedure'
                  value={p.content}
                  multiline
                  onChangeText={(content) =>
                    onChange({
                      ...value,
                      procedures: value.procedures.map((x, n) =>
                        n === i ? { ...x, content, source: manual } : x
                      ),
                    })}
                />
              </>
            )
            : null}
          <Button
            title={editing === p.key ? 'Close editor' : 'Edit procedure'}
            secondary
            disabled={disabled}
            onPress={() => setEditing(editing === p.key ? null : p.key)}
          />
        </PlanCard>
      ))}
    </>
  );
}
