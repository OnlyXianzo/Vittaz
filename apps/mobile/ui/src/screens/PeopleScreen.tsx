import type { AppState } from "../types";
import { formatPaise } from "../money";
import { PageHeader } from "../components";

export function PeopleScreen({ state }: { state: AppState }) {
  return (
    <div className="s">
      <PageHeader large title="People" />
      <div className="m" style={{ margin: "8px 2px 12px" }}>
        Receivables and payables in this synthetic preview.
      </div>
      {state.people.map((person) => (
        <div className="c row" style={{ marginTop: 12 }} key={person.id}>
          <div
            className="row"
            style={{ gap: 12, justifyContent: "flex-start" }}
          >
            <span className="lg" style={{ background: person.color }}>
              {person.name.charAt(0)}
            </span>
            <div>
              <div className="b">{person.name}</div>
              <div className="m">{person.relation}</div>
            </div>
          </div>
          <div
            className="b"
            style={{
              color:
                person.balancePaise > 0
                  ? "var(--lime)"
                  : person.balancePaise < 0
                    ? "#ffc861"
                    : undefined,
            }}
          >
            {person.balancePaise === 0
              ? "Settled"
              : formatPaise(Math.abs(person.balancePaise))}
          </div>
        </div>
      ))}
    </div>
  );
}
