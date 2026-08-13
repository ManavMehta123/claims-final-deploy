import React from "react";

export default function SkeletonRows({ columns, rows = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr className="skeleton-row" key={r}>
          {Array.from({ length: columns }).map((__, c) => (
            <td key={c}>
              <div className="skeleton-block" style={{ width: c === columns - 1 ? "40%" : `${60 + ((r + c) % 3) * 10}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
