"""
EDA for the Fast & Furious Insured claim dataset.
Generates summary stats + plots used in the Word EDA report.
"""
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import os

sns.set_theme(style="whitegrid")
ORANGE = "#EE6C2F"
DARK = "#2B2B2B"

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "reports")
os.makedirs(OUT, exist_ok=True)

df = pd.read_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "train.csv"))

# ---- Basic cleaning for EDA purposes ----
df["Expiry_date"] = pd.to_datetime(df["Expiry_date"], errors="coerce")

summary = {
    "n_rows": len(df),
    "n_cols": df.shape[1],
    "nulls": df.isnull().sum().to_dict(),
    "condition_counts": df["Condition"].value_counts().to_dict(),
    "amount_desc_condition1": df.loc[df.Condition == 1, "Amount"].describe().to_dict(),
    "negative_amounts": int((df["Amount"] < 0).sum()),
    "insurance_companies": df["Insurance_company"].value_counts().to_dict(),
}
print(summary)

# 1. Condition class balance
plt.figure(figsize=(5, 4))
counts = df["Condition"].value_counts().sort_index()
plt.bar(["No claim (0)", "Claim (1)"], counts.values, color=[DARK, ORANGE])
plt.title("Claim Condition Class Balance")
plt.ylabel("Count")
for i, v in enumerate(counts.values):
    plt.text(i, v + 10, str(v), ha="center")
plt.tight_layout()
plt.savefig(f"{OUT}/01_condition_balance.png", dpi=150)
plt.close()

# 2. Amount distribution (condition == 1, excluding sentinel -999)
plt.figure(figsize=(6, 4))
amt = df.loc[(df.Condition == 1) & (df.Amount > 0), "Amount"]
sns.histplot(amt, bins=40, color=ORANGE, kde=True)
plt.title("Claim Amount Distribution (claims only)")
plt.xlabel("Amount")
plt.tight_layout()
plt.savefig(f"{OUT}/02_amount_distribution.png", dpi=150)
plt.close()

# 3. Cost of vehicle vs Amount
plt.figure(figsize=(6, 4))
sub = df[(df.Condition == 1) & (df.Amount > 0) & df.Cost_of_vehicle.notnull()]
plt.scatter(sub.Cost_of_vehicle, sub.Amount, alpha=0.4, color=ORANGE, s=15)
plt.xlabel("Cost of vehicle")
plt.ylabel("Claim amount")
plt.title("Vehicle Cost vs Claim Amount")
plt.tight_layout()
plt.savefig(f"{OUT}/03_cost_vs_amount.png", dpi=150)
plt.close()

# 4. Insurance company vs claim rate
grp = df.groupby("Insurance_company")["Condition"].mean().sort_values(ascending=False)
plt.figure(figsize=(7, 4))
plt.bar(grp.index, grp.values, color=ORANGE)
plt.ylabel("Claim rate")
plt.title("Claim Rate by Insurance Company")
plt.tight_layout()
plt.savefig(f"{OUT}/04_claim_rate_by_company.png", dpi=150)
plt.close()

# 5. Missingness
plt.figure(figsize=(6, 4))
miss = df.isnull().sum()
miss = miss[miss > 0].sort_values(ascending=False)
plt.bar(miss.index, miss.values, color=DARK)
plt.title("Missing Values by Column")
plt.ylabel("Missing count")
plt.xticks(rotation=30, ha="right")
plt.tight_layout()
plt.savefig(f"{OUT}/05_missingness.png", dpi=150)
plt.close()

# 6. Correlation heatmap of numeric features
plt.figure(figsize=(6, 5))
num_cols = ["Cost_of_vehicle", "Min_coverage", "Max_coverage", "Condition", "Amount"]
corr = df[num_cols].corr()
sns.heatmap(corr, annot=True, cmap="Oranges", fmt=".2f")
plt.title("Correlation Matrix")
plt.tight_layout()
plt.savefig(f"{OUT}/06_correlation.png", dpi=150)
plt.close()

print("EDA plots written to", OUT)
