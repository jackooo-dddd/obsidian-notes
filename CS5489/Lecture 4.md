# Lecture 4.a
## 1. Linear Regression & Ordinary Least Squares (OLS)
Slides p.1–10 | 历年：2021A Q6
##### 什么是 Regression？
Regression 是 Supervised Learning 的一种，目标是预测连续数值，而不是类别。例如，利用房屋面积（Living Area）和房龄（Age）预测房价。
最简单的 1-dimensional Linear Regression $f(x)=wx+b$
- 其中 $w$ 是 Slope（斜率），$b$ 是 Intercept / Bias（截距）
对于多个 Features $f(x)=w^Tx+b=\sum_{j=1}^{d}w_jx_j+b$
- 其中 $x\in\mathbb R^d$，$w\in\mathbb R^d$。每个 $w_j$ 表示在其他 Features 不变时，$x_j$ 增加一个单位对预测结果的影响。例如 Slides p.10 的房价模型中，面积每增加 100 平方英尺，预测房价增加约 $8,874；房龄每增加一年，预测房价降低约 $1,048。
##### Ordinary Least Squares (OLS)
OLS 的目标是找到一组 $w,b$，使所有 Training Samples 的 Squared Prediction Error 最小：
$$
\boxed{\min_{w,b}\sum_{i=1}^{N}(y_i-f(x_i))^2}
$$
-  $y_i$ 是真实值，$f(x_i)$ 是预测值。因为误差被平方，所以较大的 Prediction Error 会受到更大的惩罚。使用 Squared Error 的好处是 Loss 非负、可微，而且 Linear Regression 的 OLS Objective 是 Convex 的，在满足相应条件时可以求出 Closed-form Solution。
##### OLS 的 Closed-form Solution
Slides p.6–7 将数据矩阵定义为 $X=[x_1,\ldots,x_N]$，每一列是一个 Training Sample。将 Bias 吸收到 Weight Vector 后，OLS 的目标可以写成 $\min_w\|y-X^Tw\|^2$，即最小化所有 Training Samples 的 Squared Prediction Error。对 $w$ 求导并令其等于零，可以得到 Normal Equation：$XX^Tw=Xy$。
- 如果 $XX^T$ 可逆，就可以直接求出 $\boxed{w^*=(XX^T)^{-1}Xy}$，这就是 OLS 的 **Closed-form Solution**，意味着可以通过矩阵运算直接求解参数，而不需要依赖 Gradient Descent。
- 如果 Features 存在线性依赖，$XX^T$ 可能不可逆，此时不能直接使用逆矩阵公式（但可以使用 Pseudoinverse 等方法）。这也是引入 Ridge Regression 的重要动机之一。

考试重点：OLS 最小化 Squared Error，标准条件下存在 Closed-form Solution，不进行 Feature Selection，也不包含 Regularization。

## 2. Ridge Regression — L2 Regularization
Slides p.12–16 | 历年：2021A Q6、2021B Q4、2023B Q6
##### 为什么需要 Ridge Regression？
普通 Linear Regression 只关心 Training Error，如果 Features 很多，可能出现 Overfitting；如果 Features 之间高度相关，还可能导致求解不稳定。Ridge Regression 在 OLS 基础上加入 L2 Regularization：
$$
\boxed{
\min_{w,b}
\underbrace{\sum_{i=1}^{N}(y_i-f(x_i))^2}_{\text{Data Fit}}
+
\underbrace{\alpha\|w\|_2^2}_{\text{Regularization}}
}
$$
其中 $\|w\|_2^2=\sum_{j=1}^{d}w_j^2$
- Data Fit Term 让模型尽可能拟合 Training Data
- Regularization Term 惩罚较大的 Weights，从而降低模型复杂度、减少 Overfitting。Slides 中不对 Bias $b$ 添加 Regularization。
- Ridge 的两个优势：减少 Overfitting，通过改善矩阵条件提高求解的数值稳定性。
##### 参数 $\alpha$ 的作用
- **$\alpha$ 越大，Regularization 越强，Weights 越倾向于接近 0。** 但 Ridge 通常不会让 Weights 精确等于 0，因为 L2 主要进行 Weight Shrinkage，而不是直接删除 Features，因此 Ridge 不能直接进行 Feature Selection。
##### Ridge 的 Closed-form Solution
Slides p.13–14 给出了 Ridge Regression 的 Closed-form Solution：$\boxed{w^*=(XX^T+\alpha I)^{-1}Xy}$。这里使用的是不显式包含 Intercept 的矩阵形式；如果单独保留 Bias $b$，通常需要对数据进行 Centering（中心化），或者单独处理 Intercept。
- OLS 使用 $XX^T$，而 Ridge 使用 $XX^T+\alpha I$。当 $XX^T$ 是 Singular（奇异）或 Ill-conditioned（病态）时，直接求逆可能不稳定。加入 $\alpha I$ 后，只要 $\alpha>0$，矩阵就会变成 Positive Definite，因此可以求逆，并且通常能够改善 Numerical Stability。这也是 Ridge 相比 OLS 的一个重要优势。
## 3. LASSO Regression — L1 Regularization
Slides p.17–22 | 历年：2021A Q6、2023B Q6、Mock Q6
##### 为什么需要 LASSO？
Ridge 虽然能够缩小不重要 Features 的 Weights，但这些 Weights 通常不会精确等于 0。如果希望模型自动删除不重要的 Features，可以使用 LASSO（Least Absolute Shrinkage and Selection Operator）。
LASSO 和 Ridge 使用相同的 Data Fit Term，但将 L2 Regularization 换成 L1：
$$
\boxed{
\min_{w,b}
\sum_{i=1}^{N}(y_i-f(x_i))^2
+
\alpha\underbrace{\|w\|_1}_{\text{L1 Regularization}}
}
$$
- 其中 $\|w\|_1=\sum_{j=1}^{d}|w_j|$
- LASSO 的核心作用是 **Weight Shrinkage + Feature Selection**，它不仅可以缩小 Weights，还可以让部分 Weights 精确等于 0。
##### 为什么 L1 可以产生 Sparse Weights，而 L2 通常不行？
这是 Lecture 4a 最重要的考点之一。Slides p.18–19 对比了两种 Regularization：
- L1 使用 $|w|$，在 0 处有 Non-differentiable Corner。当 $w\neq0$ 时，Penalty 的 Slope Magnitude 保持不变，因此即使 Weight 已经很小，仍然会受到推动其向 0 靠近的作用。
- L2 使用 $w^2$，在 0 附近平滑，其导数为 $2w$。当 Weight 越接近 0，Penalty Gradient 就越小，因此通常只会让 Weight 接近 0，而不会直接变成 0。
##### L1 与 L2 对比总结

| 属性 | L1 (LASSO) | L2 (Ridge) |
|---|---|---|
| Regularization | ∑ⱼ abs(wⱼ) | ∑ⱼ wⱼ² |
| Shrink Weights | Yes | Yes |
| Exact Zero Weights | 可以 | 通常不会 |
| Feature Selection | Yes | 通常不直接实现 |
| Sparse Model | Yes | 通常 No |
| Reduce Overfitting | Yes | Yes |
| Convex Optimization | Yes | Yes |
| Closed-form Solution | 一般没有简单闭式解 | Yes |

## 4. Feature Scaling、Cross-validation & Feature Importance
Slides p.15–17、20–22 | 历年：2021A Q11
##### Feature Scaling（特征标准化）
Slides 在 Ridge 和 LASSO 之前先对 Features 进行 Standardization：
$$
\boxed{x_j'=\frac{x_j-\mu_j}{\sigma_j}}
$$
- 这样每个 Feature 在 Training Set 上的 Mean 为 0，Standard Deviation 为 1。
- 为什么要这么做？因为不同 Features 的数值尺度可能差别很大，例如房屋面积可能是几千平方英尺，而房龄只有几十年。如果没有 Standardization，直接比较 Weights 的大小不能可靠地反映 Feature Importance，而且 Regularization 会受到不同 Feature Scales 的影响。
注意：先划分 Training/Test Data，再使用 Training Data 计算 $\mu_j,\sigma_j$，最后把同样的 Transformation 应用到 Test Data，避免 Data Leakage。
##### Cross-validation 选择 $\alpha$
对于 Ridge 和 LASSO，Regularization Strength $\alpha$ 是 Hyperparameter，需要通过 Cross-validation 选择 $\boxed{\alpha^*=\arg\min_\alpha\operatorname{CVError}(\alpha)}$

具体做法是比较不同 $\alpha$ 在 Validation Data 上的 Prediction Error，选择平均 Validation Error 最低的参数。不能直接选择 Training Error 最低的 $\alpha$，因为较小的 $\alpha$ 意味着更弱的 Regularization，虽然可能降低 Training Error，但也可能导致 Overfitting。
- Slides p.16 和 p.20 展示了 $\alpha$ 对 Weights 和 Test MSE 的影响。当 $\alpha$ 太大时，Weights 逐渐趋近 0，模型可能失去预测能力，导致 Underfitting 和 Test Error 增加。
##### Feature Importance
Slides p.17 利用 Standardized Ridge Weights 解释 Feature Importance：
$$
|w_j|\text{ 较大}\Rightarrow\text{该 Feature 对预测的影响通常较大}
$$
例如 Housing Price 实验中，Living Area 和 Overall Quality 具有较大的 Positive Weights，而 Age 具有较大的 Negative Weight。需要注意，这里的解释反映的是控制其他 Features 后的模型关系，而不是严格的因果关系；当 Features 高度相关时，也需要谨慎解释单个 Weight 的重要性。

## 5. L0 Constraint & Orthogonal Matching Pursuit (OMP)
Slides p.22–24 | 历年：Mock Q6
##### L0 Sparsity Constraint
LASSO 使用 L1 Regularization 鼓励 Sparsity，但如果希望明确限制模型最多使用多少个 Features，可以使用 L0 Constraint：
$$
\boxed{
\min_{w,b}\sum_{i=1}^{N}(y_i-f(x_i))^2
\quad\text{s.t.}\quad
\|w\|_0\le K
}
$$
- 其中 $\|w\|_0=\#\{j:w_j\neq0\}$ 表示 Weight Vector 中 Non-zero Elements 的数量。严格来说，L0 不是数学意义上的 Norm。例如 $K=3$，意味着模型最多只能使用三个 Features。
- 为什么不直接求解 L0 Optimization？因为需要从所有 Features 中选择最合适的组合，而可能的组合数量非常多，因此一般情况下属于 NP-hard 的 Combinatorial Optimization Problem。
##### Orthogonal Matching Pursuit (OMP)
OMP 是一种 Greedy Feature Selection Algorithm，用来近似求解 Sparse Regression 问题。
- 它的核心思想是：每次选择与当前 Residual Error 相关性最高的 Feature，并重新拟合模型，逐步减少 Prediction Error。
Residual $r=y-\hat y$, 选择下一个 Feature $\boxed{j^*=\arg\max_j|r^Tx_j|}$
- 其中 $x_j$ 表示第 $j$ 个 Feature 在所有 Training Samples 上组成的向量。选择新 Feature 后，OMP 会使用所有已选 Features 重新进行 Least Squares Fitting，更新 Residual，然后继续选择其他 Features，直到达到指定的 Feature 数量 $K$ 或满足停止条件。
##### OMP vs LASSO

| 比较 | LASSO | OMP |
|---|---|---|
| Method | L1 Regularization | Greedy Feature Selection |
| Feature Count | 通过 α 间接控制 | 直接设置 K |
| Sparsity | Yes | Yes |
| Global Optimality | Convex Problem，可求全局最优 | Greedy，不保证全局最优 |
| Weight Shrinkage | 有 L1 Shrinkage | 主要通过 Feature Selection 控制复杂度 |

考试陷阱：**OMP 是 Greedy Algorithm，不能保证找到 Global Optimal Feature Subset。**

## 6. OLS、Ridge、LASSO、OMP 总结

| 比较 | OLS | Ridge | LASSO | OMP |
|---|---|---|---|---|
| Objective | Minimize Squared Error | Squared Error + L2 | Squared Error + L1 | Greedy Minimize Residual |
| Regularization | None | L2 | L1 | L0 Sparsity Constraint |
| Weight Shrinkage | No | Yes | Yes | 通常不使用 L1/L2 Shrinkage |
| Feature Selection | No | 通常 No | Yes | Yes |
| Sparse Weights | 通常 No | 通常 No | Yes | Yes |
| Closed-form | 条件满足时 Yes | α > 0 时 Yes | 一般 No | 逐步 Least Squares |
| Hyperparameter | None | α | α | K |

# Lecture 4.b
## 1. Outliers & Robust Regression
Slides p.1–5 | 历年：2020 Q13、2021A Q12

### 1.1 为什么 OLS 对 Outliers 敏感？
在 Lecture 4a 中，Ordinary Least Squares (OLS) 使用 Squared Error：
$$
\boxed{L(w,b)=\sum_{i=1}^{N}(y_i-f(x_i))^2}
$$
其中 $y_i$ 是 Ground Truth，$f(x_i)$ 是 Prediction，而 $e_i=y_i-f(x_i)$ 称为 Residual（残差）。由于误差被平方，当某个数据点有非常大的 Prediction Error 时，它会对总 Loss 产生很大影响。
- 例如，误差从 2 增加到 20，Squared Loss 从 4 增加到 400，是原来的 100 倍。这会导致模型为了减少少数 Outliers 的巨大误差，而牺牲大部分正常数据的预测准确度。
Ridge Regression 通常不能直接解决这个问题，因为 Ridge 惩罚的是 Large Weights，而 Data Fit Term 仍然使用 Squared Error，因此仍然可能对 Outliers 敏感。

### 1.2 L1 Residual Loss vs L2 Squared Loss
历年：2021A Q12、2020 Q13

OLS 使用 L2 Squared Loss：

$$
L_{\mathrm{OLS}}=\sum_i(y_i-f(x_i))^2
$$

而 L1 Regression 使用 Absolute Error：

$$
\boxed{L_{\mathrm{L1}}=\sum_i|y_i-f(x_i)|}
$$

| 比较 | L1 Residual Loss | L2 Squared Loss |
|---|---|---|
| Error Penalty | abs(e) | e² |
| Large Error | 线性增加 | 平方增加 |
| Outlier Sensitivity | 更 Robust | 更 Sensitive |
| 主要用途 | 减少异常值影响 | 强调减少较大预测误差 |

为什么 L1 对 Outliers 更 Robust？因为 L1 Loss 随 $|e|$ 线性增长，而 L2 Squared Loss 随 $e^2$ 二次增长。对于非常大的 Prediction Error，L2 会给予异常点更大的惩罚，使模型更容易被 Outliers 拉偏。

2021A Q12 直接要求解释：使用 Absolute Error 代替 Squared Error 后，Regression Model 会发生什么变化？标准答案重点是：L1 Loss 对偏离整体趋势的 Outliers 更有抵抗能力，因为它不像 OLS 那样对大误差施加平方惩罚。

### 1.3 L1/L2 用在 Residual 和 Weight 上是不同的
这是 Lecture 4a 和 4b 最容易混淆的地方：

| Penalty 的位置 | L1 | L2 |
|---|---|---|
| Residual / Prediction Error | Robust to Outliers | 强烈惩罚 Large Errors |
| Model Weights | Feature Selection、Sparsity | Weight Shrinkage、减少 Overfitting |

例如 2020 Q13 给出：
$$
\boxed{
\min_w\sum_{i=1}^{N}|w^Tx_i-y_i|
+\lambda\|w\|_2^2
}
$$
这个 Objective 包含两个效果：
1. 第一项是 L1 Residual Loss，因此模型对 Outliers 更 Robust。
2. 第二项是 L2 Weight Regularization，因此模型会抑制 Large Weights，从而缓解 Overfitting。
**考试重点：看到 L1/L2 时，必须先判断它作用在 Prediction Error 上，还是作用在 Model Weights 上。**

## 2. RANSAC — 通过忽略 Outliers 改善 Regression
Slides p.2–5
RANSAC（RANdom SAmple Consensus）是一种在数据存在 Outliers 时进行 Robust Model Fitting 的方法。其核心思想是：Instead of fitting all data points, RANSAC identifies the inliers and fits the regression model using only those inliers。
- 不让所有数据点都参与最终模型拟合，而是寻找最能代表主要数据规律的 Inliers。

### 2.1 RANSAC 的工作流程
1. **Random Sampling**：随机选择少量数据点，用这些点建立一个 Candidate Regression Model。
2. **Evaluate Residuals**：计算所有数据点的 Residual，根据 Threshold $T$ 判断哪些点属于 Inliers：
$$
|y_i-f(x_i)|\le T
$$
3. **Repeat and Select**：重复随机采样和评估，保留具有最多 Inliers 的模型，其 Inlier Set 称为 Consensus Set。
4. **Refit**：使用最佳 Consensus Set 重新训练最终 Regression Model。
### 2.2 RANSAC 的重要性质
- 可以搭配不同的 Base Regression Models，不局限于 Linear Regression。
- 迭代次数越多，通常越有机会找到由正常数据组成的良好样本集。
- Residual Threshold 决定哪些数据点被视为 Inliers；太大可能保留 Outliers，太小可能排除正常点。
- 需要足够多的随机尝试，才能提高找到良好 Consensus Set 的概率。
考试重点：RANSAC 与 Ridge、LASSO 不同。Ridge 和 LASSO 主要通过 Regularization 限制 Weights，而 RANSAC 的核心是通过识别并排除 Outliers，使用 Inliers 重新拟合模型，提高 Regression Robustness。

## 3. Non-linear Regression — Polynomial Features
Slides p.5–11 | 历年：2021B Q11

### 3.1 为什么需要 Non-linear Regression？
普通 Linear Regression 使用：
$$
f(x)=w^Tx+b
$$
但现实中的变量之间可能存在 Non-linear Relationships。例如房屋价格与房龄之间不一定是简单的直线关系。

一种解决方式是增加 Non-linear Features，例如 $x^2,x^3$，从而得到 Polynomial Regression：
$$
\boxed{f(x)=w_0+w_1x+w_2x^2+\cdots+w_px^p}
$$
其中 $p$ 是 Polynomial Degree。

### 3.2 Polynomial Regression 为什么仍然是 Linear Model？
因为虽然 Polynomial Regression 对原始 Input $x$ 是非线性的，但对 Model Parameters $w$ 仍然是线性的。定义 Feature Transformation：
$$
\phi(x)=
\begin{bmatrix}
1\\
x\\
x^2\\
\vdots\\
x^p
\end{bmatrix}
$$

那么：
$$
\boxed{f(x)=w^T\phi(x)}
$$
因此仍然可以使用普通 Linear Regression 的方法学习 $w$，只是 Input Features 经过了 Non-linear Transformation。例如对于两个原始 Features $x_1,x_2$，Degree 2 的 Polynomial Features 可以包括 $x_1^2,x_1x_2,x_2^2$，其中 $x_1x_2$ 能够表达 Feature Interaction。

### 3.3 Polynomial Degree 越高越好吗？

不一定。Degree 越高，模型的表达能力通常越强。在没有额外 Regularization、并且优化到全局最优时，提高 Degree 不会使最优 Training MSE 增加，因为新增加的 Polynomial Coefficients 可以设为 0。但 Degree 过高也可能导致 Overfitting，使 Training Error 降低而 Validation/Test Error 上升。

| Polynomial Degree | 主要表现 | 风险 |
|---|---|---|
| Low Degree | Model 太简单，难以捕捉非线性 | Underfitting |
| Appropriate Degree | 捕捉主要趋势，具有较好 Generalization | 较合理 |
| High Degree | 能拟合复杂变化，甚至 Noise | Overfitting |

### 3.4 使用 Cross-validation 选择 Degree
Polynomial Degree 是 Hyperparameter，需要通过 Cross-validation 选择：
$$
\boxed{p^*=\arg\min_p\operatorname{CVMSE}(p)}
$$

也就是比较不同 Degree 的 Validation MSE，选择平均 Validation Error 最低的 Degree。Slides p.10 的 Housing Price 实验中，Cross-validation 选择了 Degree 2，而不是最高的 Degree 6。

**考试重点：不能只根据 Training Error 选择 Polynomial Degree，而应该根据 Validation Performance 选择模型复杂度。**

### 3.5 2021B Q11 — 如何改善表现不佳的 Regression Model？
题目描述使用 Linear Regression 预测出租车需求，但预测效果不佳，要求给出改进方法。标准答案提出三种方向，任选两种解释：
1. Add Non-linear Features：例如 Polynomial Features，使模型能够学习复杂的 Non-linear Relationships。
2. Add More Informative Features：当前 Features 可能不足以解释数据变化。
3. Use Non-linear Regressors：例如 Random Forest，可以直接学习复杂的 Non-linear Relationships。
这道题考的是根据模型的问题提出合理的改进方案，而不是单纯写公式。

## 4. Kernel Ridge Regression (KRR)
Slides p.12–15
### 4.1 什么是 Kernel Ridge Regression？

Lecture 4a 的 Ridge Regression 本来是 Linear Regression：

$$
f(x)=w^Tx+b
$$

Kernel Ridge Regression 将 SVM 中的 Kernel Trick 应用于 Ridge Regression，让模型能够学习 Non-linear Functions。核心思想是使用 Kernel Function $k(x_i,x_j)$，直接计算样本在隐式 Feature Space 中的 Inner Product，而不需要显式构造高维 Feature Vector。

Slides 的 Prediction Formula：

$$
\boxed{f(x_*)=k_*^T(K+\alpha I)^{-1}y}
$$

其中：
- $K$：$N\times N$ Kernel Matrix，$K_{ij}=k(x_i,x_j)$。
- $k_*$：Test Sample $x_*$ 与所有 Training Samples 之间的 Kernel Values。
- $\alpha$：Regularization Strength。

## 6. Ensemble Learning & Random Forest Regression
Slides p.21–27 | 历年：2020 Q2、Mock Q5

### 6.1 什么是 Ensemble Learning？
Ensemble Learning 的目标是组合多个模型进行预测，而不是仅依赖单个模型。Slides 主要介绍 Bagging 和 Boosting 两种方法：
- Bagging：使用随机抽取的 Training Samples 训练多个模型，再聚合它们的预测结果。
- Boosting：顺序训练多个模型，让后面的模型逐步修正前面模型的 Prediction Errors。
两者的主要区别是 Training Strategy，这也是 Lecture 4b 的重要概念。
### 6.2 Decision Tree Regression
Decision Tree 是一种 Rule-based Model：每个 Internal Node 根据 Feature 条件进行划分，最终在 Leaf Node 输出 Prediction。对于 Regression Tree，Leaf Node 通常预测落入该节点的 Training Targets 的平均值。
- Decision Tree 不要求预测函数必须是直线，因此能够直接学习复杂的 Non-linear Relationships。但单棵 Decision Tree 容易 Overfitting，所以可以通过组合多棵 Trees 来改善 Generalization。
### 6.3 Random Forest Regression
Random Forest 使用 Bagging 的思想训练多个 Decision Trees，Slides p.21–22 介绍了两个随机性来源：
1. 每棵 Tree 从 Training Data 中随机抽样，形成自己的 Training Dataset。
2. 每次 Split 时，随机选择一部分 Features 作为候选划分特征。
最终对于 Test Sample $x$，Random Forest 对所有 Tree 的 Predictions 取平均：
$$
\boxed{f_{\mathrm{RF}}(x)=\frac1T\sum_{t=1}^{T}f_t(x)}
$$
其中 $T$ 是 Trees 的数量。通过聚合多个 Decision Trees，Random Forest 可以降低单棵 Tree 的预测不稳定性，并改善 Generalization Performance。

### 6.4 Random Forest 的重要性质

| 属性 | 解释 |
|---|---|
| Non-linear Regression | 可以学习复杂的 Non-linear Relationships |
| Bagging | 使用随机抽取的数据训练多棵 Trees |
| Random Feature Subset | 每次 Split 考虑部分 Features |
| Prediction | 平均多个 Trees 的预测 |
| Overfitting | 通常比单棵 Tree 更能 Generalize |
| Regression Function | 通常呈阶梯状或分块状 |
| Outlier Robustness | 仍可能受到 Outliers 影响 |

Slides p.23–25 展示了 Random Forest 的 Prediction Function：单棵 Tree 通常产生 Staircase-shaped Predictions，多棵 Trees 的结果平均后，预测更加稳定。随着 Trees 数量增加，模型性能通常逐渐趋于稳定，但更多 Trees 并不保证每次都能降低 Validation Error。

### 6.5 Tree Depth & Cross-validation
Random Forest 的另一个重要 Hyperparameter 是 `max_depth`。Depth 太小，Tree 可能过于简单，产生 Underfitting；Depth 太大，Tree 可能学习过多 Training Noise，增加 Overfitting Risk。
Slides p.26–27 使用 Cross-validation 选择 Tree Depth，在该 Housing Dataset 中最佳 `max_depth` 为 5。因此，虽然 Random Forest 通常比单棵 Tree 更稳定，仍然需要合理控制 Model Complexity。

## 7. Boosting & XGBoost Regression

Slides p.27–29 | 历年：Mock Q5
### 7.1 什么是 Boosting？
Boosting 是一种 Ensemble Learning Method，但与 Bagging 不同，Boosting 的 Models 是 Sequentially Trained（顺序训练）的。
其核心思想是：Combine weak learners into a strong learner, with each new model trained to correct errors made by previous models.
- 先训练一个 Weak Learner，再根据前面模型的 Prediction Errors 训练新模型，逐步提高整个 Ensemble Model 的预测能力。
### 7.2 XGBoost Regression
XGBoost 是 Gradient Boosting 的一种实现。Slides p.27–28 强调，每次迭代中新模型会根据当前 Loss 的 Gradient，修正已有 Ensemble 的预测函数。
概念上可以写成：
$$
\boxed{f_t(x)=f_{t-1}(x)-\alpha_t h_t(x)}
$$
其中 $f_{t-1}$ 是当前 Ensemble Model，$h_t$ 表示新模型对 Loss Gradient 的近似，$\alpha_t$ 是 Learning Rate，控制每次更新的幅度。
对于 Squared Error Loss，Gradient 与 Prediction Residual 成正比，因此可以理解成：新的 Weak Learner 不断学习并修正前面模型留下的 Prediction Errors。
### 7.3 Bagging vs Boosting

| 比较 | Bagging / Random Forest | Boosting / XGBoost |
|---|---|---|
| Training | 多个模型分别训练 | 模型按顺序训练 |
| Dataset / Focus | 随机抽取 Training Samples | 关注前面模型的错误 |
| Aggregation | 平均多个模型的预测 | 逐步累积修正结果 |
| Learning Rate | 标准 RF 没有此参数 | 重要 Hyperparameter |
| Main Idea | 组合模型，改善稳定性 | 逐步修正 Prediction Errors |
| Classification | Yes | Yes |
| Regression | Yes | Yes |

### 7.4 Mock Q5（历年重点）
Mock Q5 直接考 Random Forest 和 Boosting 的性质，标准答案为 A、C。
- A Correct：Random Forest 在构建 Trees 时使用 Random Feature Subsets，更准确地说，每次 Split 会随机选择候选 Features。
- B False：标准 Random Forest 不使用 Learning Rate 控制 Trees 之间的更新；Learning Rate 是 Boosting 的典型参数。
- C Correct：Random Forest 和 Boosting 都可以用于 Regression。
- D False：Random Forest 和 Boosting 都可以用于 Classification 和 Regression。
最重要的区别是：**Bagging 主要通过聚合多个模型提高稳定性；Boosting 通过顺序训练不断修正之前模型的错误。**

## 8. Asymmetric Regression Loss（历年重点）

Mock Q12（10 marks）| Regression Loss Application
### 8.1 题目背景
一家共享单车公司需要预测某个站点每天的自行车需求量，以决定配送多少辆车。公司认为 Overestimation（高估）可以接受，因为多准备几辆车问题不大；但 Underestimation（低估）会导致自行车不够，可能造成客户流失，因此代价更高。

普通 Squared Error 对正负 Prediction Errors 的惩罚是对称的：
$$
L(\hat y,y)=(\hat y-y)^2
$$
也就是说，高估 10 和低估 10 产生相同 Loss，但这不符合公司的业务需求，因此需要设计 Asymmetric Loss Function。

### 8.2 如何设计 Asymmetric Loss？

设 $\hat y=f(x)$ 为预测值，可以定义：

$$
\boxed{
L(\hat y,y)=
\begin{cases}
a(\hat y-y)^2,&\hat y\ge y\\
b(\hat y-y)^2,&\hat y<y
\end{cases}
}
$$

其中：

$$
\boxed{0<a<b}
$$

当 $\hat y\ge y$ 时属于 Overestimation，使用较小的 Penalty $a$；当 $\hat y<y$ 时属于 Underestimation，使用较大的 Penalty $b$。这样模型会更加重视避免低估。

## 9. 其他内容：Feature Normalization & Output Transformation

Slides p.29–30

### 9.1 Feature Normalization

使用 Regularization 的 Regression Methods，例如 Ridge 和 LASSO，通常需要对 Features 进行 Standardization。原因与 Lecture 4a 相同：不同 Features 的 Scale 会影响 Weight Penalty，而标准化能够让不同 Features 的 Weights 更容易比较和解释。

$$
\boxed{x_j'=\frac{x_j-\mu_j}{\sigma_j}}
$$

需要记住，Scaling Parameters 应从 Training Data 中计算，然后应用到 Validation/Test Data，避免 Data Leakage。

### 9.2 Output Transformation

如果 Regression Target $y$ 的数值范围特别大，大数值样本可能因为产生更大的 Absolute Errors，而在 Squared Loss 中占据主导地位。因此，对于合适的正值 Target，可以考虑先做 Log Transformation：

$$
\boxed{y'=\log_{10}(y)}
$$

然后在变换后的 Target Space 中训练 Regression Model。如果最后需要原始单位的预测值，再进行 Inverse Transformation：

$$
\hat y=10^{\hat y'}
$$

这一部分没有在已有题库中单独出现，理解 Output Transformation 的目的即可，不需要花太多时间。


## Lecture 4b 核心总结

| 方法 | 主要思想 | 解决的问题 |
|---|---|---|
| L1 Residual Regression | 使用 Absolute Error | Reduce Outlier Sensitivity |
| RANSAC | 随机采样并寻找 Inliers | Robust Model Fitting |
| Polynomial Regression | 增加 Non-linear Features | Non-linear Relationships |
| Kernel Ridge Regression | Ridge + Kernel Trick | Non-linear Regression |
| SVR | Epsilon-insensitive Loss | 允许一定范围内的预测误差 |
| Random Forest | Bagging + Multiple Trees | 提高稳定性，学习非线性关系 |
| XGBoost | Sequential Gradient Boosting | 逐步修正 Prediction Errors |
| Asymmetric Loss | 不同错误给予不同 Penalty | Different Costs of Prediction Errors |

从历年 Midterm 来看，最值得优先掌握的是：L1 Residual Loss vs L2 Squared Loss、L1/L2 Residual 与 Weight Regularization 的区别、Polynomial Features 如何解决 Underfitting、Bagging vs Boosting，以及如何根据实际业务需求设计 Asymmetric Loss Function。
