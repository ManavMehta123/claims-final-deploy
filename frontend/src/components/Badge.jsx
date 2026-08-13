import React from "react";

export default function Badge({ status }) {
  const cls = `badge badge-${(status || "").toLowerCase().replace(/\s+/g, "")}`;
  return <span className={cls}>{status}</span>;
}
