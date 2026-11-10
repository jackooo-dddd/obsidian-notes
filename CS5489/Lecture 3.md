# 3.a
##  Generative vs Discriminative Classifiers（生成式与判别式分类器）
- Slides P1–5 | 历年：2021A Q1、2021B Q7、2023B Q8
- 这是 Lecture 2 和 Lecture 3a 之间最重要的联系。Generative Classifier 的代表是 Naïve Bayes，它首先学习各类别的 Class-Conditional Distribution $p(x\mid y)$ 和 Prior $p(y)$，再利用 Bayes' Rule 计算 Posterior。 Generative Model 试图理解不同类别的数据是怎样生成的，再进行分类。
- Discriminative Classifier 的代表是 Logistic Regression 和 SVM，它不需要学习整个 CCD，而是直接学习 $p(y\mid x)$ 或 Decision Boundary，从而避免复杂的密度估计问题。

| 比较         | Generative          | Discriminative                   |
| ---------- | ------------------- | -------------------------------- |
| 主要学习对象     | $p(x\mid y)$、$p(y)$ | $p(y\mid x)$ 或 Decision Boundary |
| 是否需要建模 CCD | 是                   | 否                                |
| 代表模型       | Naïve Bayes         | Logistic Regression、SVM          |
| 模型解释       | 每一类数据的典型分布          | 哪些特征有助于区分类别                      |
| 数据较少时      | 分布假设合适时可能有优势        | 不保证总是更好                          |

2021B Q7（10 marks）要求比较 Generative 和 Discriminative，并解释它们的可解释性。Generative Model 的 CCD 可以描述某个类别的 Typical Features，而 Discriminative Model 的 Weights 可以反映区分类别的重要特征（Key Differences）。Generative Model 在数据较少、分布假设适当时可能有优势，但不是绝对的。

## Why Gaussian Naïve Bayes Can Be a Linear Classifier
- Slides P2–5 | 历年：2023B Q8
Gaussian Naïve Bayes 假设给定类别后 Features 条件独立，并且各 Feature 服从 Gaussian Distribution。如果两个类别的所有 Features 共享相同的 Variance $\sigma^2$，假设它们的 Mean Vector 分别是：$\mu=(\mu_1,\ldots,\mu_D),\qquad \nu=(\nu_1,\ldots,\nu_D)$ 将 Gaussian CCD 代入 Bayesian Decision Rule，比较两个类别的 Log-Posterior 后，二次项会相互抵消，最终得到 Linear Classifier：
$$
\boxed{f(x)=w^Tx+b}
$$
其中 $w_i=\frac{\mu_i-\nu_i}{\sigma^2}$,  $b=\frac{1}{2\sigma^2}\sum_i(\nu_i^2-\mu_i^2)+\log\frac{\pi_1}{\pi_2}$
这里 $\pi_1,\pi_2$ 是两个类别的 Prior Probabilities。重点是：**在 Shared Variance Gaussian Assumption 下，Gaussian NB 可以得到 Linear Decision Boundary，但它仍然是 Generative Model。**
- Naïve Bayes 先估计 $\mu,\nu,\sigma^2,\pi$，然后推导 $w,b$；
- Logistic Regression 则直接通过分类目标学习 $w,b$。
因此，两者都可以是 Linear Classifiers，但训练原理不同。如果两个类别的 Variance 不同，Gaussian NB 的 Decision Boundary 还可能是 Nonlinear。
## Linear Classifier & Decision Boundary（线性分类器）
- Slides P5–8 | 历年：2021A Q8、2021B Q1
Linear Classifier 的基本形式为 $\boxed{f(x)=w^Tx+b}$
- 其中 $w$ 是 Feature Weights，$b$ 是 Bias。对于 $y\in\{-1,+1\}$，分类规则为：
$$
\hat y=
\begin{cases}
+1,&f(x)>0\\
-1,&f(x)<0
\end{cases}
$$
- Decision Boundary 位于两个类别的分界位置：$\boxed{w^Tx+b=0}$
需要理解三个性质：
- $w$ 控制 Decision Boundary 的方向，并且垂直于边界（Normal Vector）
- $b$ 控制边界的位置；
- 当 Feature Dimension 为 $D$ 时，Decision Boundary 是一个 $D-1$ 维的 Hyperplane。例如二维空间中的 Decision Boundary 是一条直线，三维空间中则是一个平面
考试常问：为什么 Logistic Regression 使用非线性的 Sigmoid Function，却仍然是 Linear Classifier？因为 Sigmoid 只是把线性分数 $f(x)$ 转换成概率，当 Classification Threshold 为 0.5 时 (或者固定介于 0 和 1 之间), Logistic Regression 的 Decision Boundary 满足 $P(y=1\mid x)=0.5$。由于 $P(y=1\mid x)=\sigma(w^Tx+b)$，而 Sigmoid Function 为 $\sigma(z)=\frac{1}{1+e^{-z}}$，因此在 Decision Boundary 上有 $\sigma(w^Tx+b)=0.5$。因为 $\sigma(0)=0.5$ 且 Sigmoid 单调递增，所以 $\boxed{w^Tx+b=0}$，这说明虽然 Sigmoid 是 Nonlinear Function，但 Logistic Regression 的 Decision Boundary 仍然是 Linear 的。
## Logistic Regression & Sigmoid Function（逻辑回归与概率）
- Slides P8–10 | 历年：2023B Q2、Mock Q2
Logistic Regression 在 Linear Classifier 的基础上增加 Sigmoid Function，将任意 $f(x)=w^Tx+b$ 映射到 0 到 1 之间的概率 $\sigma(z)=\frac{1}{1+e^{-z}}$ (`Output a probability instead of a raw linear score`.)
- $p(y=+1\mid x)=\sigma(w^Tx+b)$
- $p(y=-1\mid x)=1-\sigma(w^Tx+b)$
当 $f(x)>0$ 时，$p(y=+1\mid x)>0.5$，模型预测为 Class +1；当 $f(x)=0$ 时，$p(y=+1\mid x)=0.5$，此时位于 Decision Boundary；当 $f(x)<0$ 时，$p(y=+1\mid x)<0.5$，模型预测为 Class −1。
- Sigmoid 有一个重要性质 $\boxed{1-\sigma(z)=\sigma(-z)}$
因此，当 $y\in\{-1,+1\}$ 时，可以用一个公式同时表示两个类别：
$$
\boxed{p(y\mid x)=\sigma(yf(x))}
$$
- 这个公式是后面推导 Logistic Loss 的基础。
考试重点：Logistic Regression 虽然叫 Regression，但这里用于 Classification；它直接建模 Posterior Probability $p(y\mid x)$，而不是 Class-Conditional Distribution $p(x\mid y)$。

## Maximum Likelihood Estimation & Logistic Loss
- Slides P10–12 | 历年：2020 Q1、Mock Q8
Logistic Regression 使用 MLE 学习 $w,b$，目标是让 Training Data 中真实标签出现的概率尽可能大：
$$
(w^*,b^*)=\arg\max_{w,b}\sum_{i=1}^{N}\log p(y_i\mid x_i)
$$
由于 $p(y_i\mid x_i)=\sigma(y_if(x_i))$，代入并取负号后，可以把 Maximization 转换成 Minimization：
$$
\boxed{
(w^*,b^*)=\arg\min_{w,b}
\sum_{i=1}^{N}\log(1+e^{-y_if(x_i)})
}
$$
- 这里定义 $\boxed{z_i=y_if(x_i)}$, Logistic Loss Function 为 $\boxed{L(z_i)=\log(1+e^{-z_i})}$
- $z_i$ 可以理解成 Signed Classification Score，它同时考虑了真实标签 $y_i$ 和模型预测分数 $f(x_i)$。
- 对于 Logistic Loss，当 $z<0$ 时，表示样本被错误分类（Incorrectly Classified），此时 Loss 较大，而且错误越严重，Loss 越大；当 $z=0$ 时，表示样本位于 Decision Boundary 上，此时 Loss 为 $\log 2$；当 $z>0$ 时，表示样本被正确分类（Correctly Classified），此时 Loss 较小，并且随着 $z$ 增大逐渐接近 0。
- 需要注意，即使样本已经被正确分类，它的 Logistic Loss 通常也不等于 0，而是逐渐趋近于 0。
考试可能问：为什么 Logistic Loss 会惩罚 Misclassified Samples？因为错误分类时 $y_if(x_i)<0$，而且错误越严重，$z_i$ 越负，$L(z_i)$ 就越大。最小化 Logistic Loss 会鼓励模型提高真实类别的预测概率。Mock Q8 要求解释 Objective Function 中 Logistic Loss Term 的作用。
## L2 Regularization & Gaussian Prior（重点）
- Slides P12–17 | 历年：2021A Q5、2023B Q2、Mock Q8
如果只最大化 Training Data 的 Likelihood，模型可能产生过大的 Weights，导致 Overfitting。为了解决这个问题，Slides 给 $w$ 引入 Gaussian Prior：
$$
p(w)=\mathcal N\left(0,\frac C2 I\right)
$$
这表示希望学到的 Weights 不要离 0 太远。将 Gaussian Prior 加入目标函数后，得到：
$$
\boxed{
\min_{w,b}
\underbrace{\frac1C\|w\|_2^2}_{\text{Regularization}}
+
\underbrace{\sum_{i=1}^{N}\log(1+e^{-y_if(x_i)})}_{\text{Data Fit}}
}
$$

- Data Fit Term 让模型尽可能正确地预测 Training Data；Regularization Term 限制 Weights 的大小，降低模型复杂度，从而减少 Overfitting。
- **参数 $C$ 的作用非常重要。** Slides 使用 $C$，但 Mock Q8 使用 $\alpha$ 作为直接乘在 L2 Penalty 前面的系数 $\alpha\|w\|_2^2+\sum_iL_i$, $\alpha=\frac1C$. **$C$ 和 $\alpha$ 的方向相反。** 如果题目使用 $\alpha$ 直接乘 L2 Penalty，那么 $\alpha$ 越大，Regularization 越强；但如果使用 $\frac1C$，则 $C$ 越大，Regularization 越弱。

| 比较 | $C$ 增大 | $C$ 减小 |
|---|---|---|
| Regularization Strength | 减弱 | 增强 |
| Weight Magnitude | 允许更大 | 倾向更小 |
| Model Complexity | 倾向更复杂 | 倾向更简单 |
| Overfitting Risk | 增加 | 减少 |
| Posterior Probability | 更容易接近 0/1 | 较不容易饱和 |

历年考点：2021A Q5 考 L2 Prevent Overfitting 和 Gaussian Prior ；2023B Q2 考 Gaussian Prior 与 Regularization；Mock Q8 要求解释 $\alpha$ 增大或减小时，Weights 与 Model Complexity 如何变化。
## Optimization & Gradient Descent
- Slides P13 | 历年：2023B Q2
Logistic Regression 的优化目标通常没有 Closed-form Solution，因为 Sigmoid Function 是非线性的，导致 Maximum Likelihood 的一阶条件无法直接解出参数 w。
因此需要使用 Iterative Optimization Algorithms，例如 Gradient Descent。更新公式为：
$$
\boxed{w\leftarrow w-\eta\frac{dE}{dw}}
$$
-  其中 $E$ 是 Objective Function，$\eta$ 是 Learning Rate。每次迭代沿着 Gradient 的反方向更新 Weights，逐步降低 Loss。Learning Rate 控制每次参数更新的步长，太大可能导致训练不稳定，太小则可能导致收敛缓慢。
需要知道：标准 Logistic Regression 的 Negative Log-Likelihood 是 Convex Function，因此不会出现非全局的局部最小值，但并不能无条件保证每个数据集都有唯一且有限的最优解。2023B Q2 的选项 A 声称 Logistic Regression 有 Closed-form MLE Solution，标准答案判定为 False。
## Cross-validation（交叉验证）
- Slides P17–19 | 历年：2020 Q4、2021A Q11
Cross-validation 用来选择 Hyperparameters，例如 Regularization Parameter $C$ 或 $\alpha$。Slides 介绍的是 K-fold Cross-validation：先把 Training Data 分为 $K$ 份，每次用其中一份作为 Validation Set，其余 $K-1$ 份用于训练，最后计算各个 Hyperparameter 的平均 Validation Performance。
![[Pasted image 20261012181128.png|643]]
最后选择平均 Validation Accuracy 最高的 $C$：
$$
\boxed{
C^*=\arg\max_C\frac1K\sum_{k=1}^{K}\mathrm{Accuracy}_k(C)
}
$$
- Training Set 用于学习模型参数 `w, b`
- Validation Set 用于选择 Hyperparameters（例如 `C`）
- Test Set 用于最终评估模型的 Generalization Performance。选定最优的 `C` 后，再使用整个 Training Set 重新训练模型，最后在 Test Set 上进行评估。**不要使用 Test Set 来选择 $C$**，否则会导致 Test Information Leakage 和评估偏差。
2020 Q4 考察了 Cross-validation 的正确说法。重点包括：Validation Set 来自 Training Data；在 Validation Data 上表现最好的 Hyperparameter，不保证在 Test Data 上也一定最好。Slides P19 的例子选择了 $C\approx4.28$，不需要记这个具体数值，只需要理解选择过程。
## Multi-class Classification — One-vs-Rest
- Slides P19–22 | 历年：Mock Q2
前面介绍的 Logistic Regression 主要是 Binary Classifier，即一次区分两个类别。
- 如果有 $K$ 个类别，Slides 介绍了 One-vs-Rest（OvR）方法：训练 $K$ 个 Binary Classifiers，每个分类器负责区分某一类和其他所有类别。
例如，如果有三个类别，One-vs-Rest (OvR) 会训练三个 Binary Classifiers：
- Classifier 1 负责区分 Class 1 和 Classes 2、3；Classifier 2 负责区分 Class 2 和 Classes 1、3；Classifier 3 负责区分 Class 3 和 Classes 1、2。最后比较三个 Classifiers 对各自类别的预测分数或概率，选择最高的类别作为最终预测结果。
Mock Q2 考察：如果有三个类别，是否只需要两个 OvR Decision Boundaries？答案是 **False**，因为 OvR 需要训练三个 Binary Classifiers。一般来说 $K\text{ classes}\rightarrow K\text{ binary classifiers}$
## Multiclass Logistic Regression — Softmax & Cross-Entropy
- Slides P23–26 | 多分类相关知识
除了 OvR，还可以直接定义一个 Multiclass Objective，联合训练所有类别的参数。首先给每个 Class $c$ 定义一个 Linear Score $f_c(x)=w_c^Tx+b_c$. 
然后使用 Softmax Function 将所有 Class 的 Scores 转换为概率。具体来说，先对每个 Score 取指数 $e^{f_c(x)}$，再除以所有类别指数分数的总和，完成 Normalization
$$
\boxed{
\begin{aligned}
p(y=c\mid x)
&=\operatorname{Softmax}(f(x))_c\\
&=\frac{e^{f_c(x)}}{\sum_{j=1}^{K}e^{f_j(x)}}\\
&=\frac{e^{w_c^Tx+b_c}}{\sum_{j=1}^{K}e^{w_j^Tx+b_j}}
\end{aligned}
}
$$
Softmax 将任意实数 Scores 转换成 0 到 1 之间的概率，并保证所有 Class 的概率之和等于 1。由于指数函数是单调递增的，Softmax 不会改变 Scores 的大小顺序，所以直接选择 Score 最大的类别：
$$
\boxed{\hat y=\arg\max_c p(y=c\mid x)=\arg\max_c f_c(x)}
$$
训练时使用 Maximum Likelihood Estimation，如果真实标签采用 One-hot Encoding，就会得到 Cross-Entropy Loss：
$$
\boxed{L=-\sum_{c=1}^{K}y_c\log p(y=c\mid x)}
$$
其中 $y_c=1$ 表示真实类别为 $c$，其余类别对应的 $y_c=0$。因此 Cross-Entropy 实际上就是对真实类别预测概率取 Negative Log。

| 比较                   | One-vs-Rest                   | Multinomial Logistic Regression |
| -------------------- | ----------------------------- | ------------------------------- |
| 训练方式                 | 训练 $K$ 个独立 Binary Classifiers | 联合训练所有类别                        |
| Probability Function | 每个分类器使用 Sigmoid               | 所有类别共同使用 Softmax                |
| 分类方式                 | 比较各 Binary Classifiers 的输出    | 比较 Softmax Probabilities        |
| Training Objective   | 多个 Binary Logistic Loss       | Multiclass Cross-Entropy        |

## L1 vs L2 Regularization（考试额外补充）
历年：2020 Q12a、Q12b、2021A Q11
虽然 Lecture 3a Slides 主要介绍 L2，但历年 Midterm 多次考察 L1 Regularization，因此需要同时掌握。L1 Regularization 使用 Weight Absolute Values 的总和 $\|w\|_1=\sum_j|w_j|$

| 比较 | L1 Regularization | L2 Regularization | L1 + L2 |
|---|---|---|---|
| Linear Regression Name | LASSO Regression | Ridge Regression | Elastic Net Regression |
| Penalty | λ∑ⱼ abs(wⱼ) | λ∑ⱼ wⱼ² | λ₁∑ⱼ abs(wⱼ) + λ₂∑ⱼ wⱼ² |
| Weights | 某些可以精确等于 0 | 通常缩小，但不精确等于 0 | 同时实现稀疏化和权重收缩 |
| Feature Selection | 可以 | 通常不能直接完成 | 可以 |
| Prevent Overfitting | 可以 | 可以 | 可以 |
| 典型效果 | Sparse Weights | Shrink Weights | Sparse + Shrink Weights |

**重要区别：** L1（LASSO）倾向于产生 Sparse Weights，让部分权重精确变成 0，因此可以进行 Feature Selection；L2（Ridge）主要让 Weights 变小，但通常不会直接变成 0；Elastic Net 则结合 L1 和 L2 的特点，同时实现 Feature Selection 和 Weight Shrinkage。

# 3.b
## Maximum Margin & Support Vectors
- Slides P2–13 | 历年：2021B Q3、Mock Q3
SVM（Support Vector Machine）的核心思想是：**在所有能够分开不同类别的 Decision Boundaries 中，选择 Margin 最大的那个。**
- 回顾 Linear Classifier $f(x)=w^Tx+b$, Decision Boundary 为 $w^Tx+b=0$
- 如果 Training Data 是 Linearly Separable 的，那么可能存在很多条直线能够正确区分两个类别。SVM 通过 Maximum Margin 选择其中一条。
- Slides 将 Margin 定义为距离 Decision Boundary 最近的训练样本，到边界的距离 $d_i=\frac{|w^Tx_i+b|}{\|w\|}$
`Margin` $\gamma=\min_i\frac{|w^Tx_i+b|}{\|w\|}$
- SVM 为什么要 Margin 尽可能大？因为更大的 Margin 意味着 Decision Boundary 两侧具有更大的缓冲空间，当数据发生小幅变化，或者估计的 $w$ 存在一定误差时，分类结果更不容易受到影响。
Support Vectors（支持向量）是决定 Margin 的关键训练样本。对于 Hard-Margin SVM，Support Vectors 位于 Margin 的边界上。在标准 SVM 的归一化条件下：
$$
\begin{aligned}
f(x)&=0 &&\text{Decision Boundary}\\
f(x)&=1 &&\text{Positive Margin}\\
f(x)&=-1 &&\text{Negative Margin}
\end{aligned}
$$
从 Decision Boundary 到任意一侧 Margin 的距离为 $1/\|w\|$，两条 Margin 之间的总距离为 $2/\|w\|$。
![[Pasted image 20261012185038.png|637]]
考试重点：Support Vectors 是决定分类边界的关键点。移动 Support Vector 可能改变 Decision Boundary；而移动远离 Margin 的 Non-support Vector，通常不会影响已学到的边界。
## SVM Optimization — Primal & Dual Problem
- Slides P12–15 | 历年：2020 Q9、2023B Q3
SVM 可以通过同时 Scaling（缩放）$w,b$，让距离 Decision Boundary 最近的 Training Samples 满足 $\min_i|w^Tx_i+b|=1$。原本的 Margin 公式是 $\gamma=\min_i\frac{|w^Tx_i+b|}{\|w\|}$，其中最近样本的 $|w^Tx_i+b|$ 不一定等于 1，例如可能等于 3。但因为同时将 $w,b$ 除以 3 不会改变 Decision Boundary（$\frac{w^Tx+b}{3}=0\iff w^Tx+b=0$），所以我们可以选择合适的 Scaling Factor，使最近样本的 $|w^Tx_i+b|=1$。此时 Margin 公式就简化为 $\gamma=\frac{1}{\|w\|}$，**因此 Maximizing Margin 等价于 Minimizing $\|w\|^2$**。
- Hard-Margin SVM 的 Primal Problem 是 $\min_{w,b}\frac12\|w\|^2$ subject to $y_i(w^Tx_i+b)\geq1,\quad\forall i$
- Objective: 最小化 $\|w\|^2$，从而最大化 Margin
- Constraint: 要求每个 Training Sample 都被正确分类，并位于 Margin 上或外侧。
Primal 直接优化 $w,b$。
Slides 随后通过 Lagrange Multipliers 将其转换成 Dual Problem：
$$
\max_{\alpha}\sum_i\alpha_i-\frac12\sum_i\sum_j\alpha_i\alpha_jy_iy_jx_i^Tx_j
$$
- 约束 $\alpha_i\geq0,\qquad\sum_i\alpha_iy_i=0$
- 最重要的结论是 $w=\sum_i\alpha_i y_i x_i$
- 对于 Hard-Margin SVM $\alpha_i>0\Rightarrow x_i\text{ is a Support Vector}$
因此，最终的 Weight Vector $w$ 可以表示成 Support Vectors 的加权组合，而不需要所有 Training Samples 都参与最终的预测。

| 比较       | Primal                  | Dual                       |
| -------- | ----------------------- | -------------------------- |
| 优化变量     | `w, b`                  | `αᵢ`                       |
| 变量数量（大致） | Feature Dimension `d`   | Sample Number `N`          |
| 主要计算     | 原始 Features 和 Weights   | Samples 之间的 Inner Products |
| 重要作用     | Linear SVM Optimization | Kernel Trick 的基础           |

2020 Q9（10 marks）：假设有 2,000 个 Patients，每人有 100,000 个 Features，Linear SVM 训练过慢，如何改善？标准答案给出使用 Dual Formulation 的思路。Primal 主要优化一个 100,000 维的 Weight Vector，而 Dual 优化 2,000 个 $\alpha_i$，所以在 $N\ll d$ 的情况下，Dual 可能更合适。题库也接受适当的 Solver Selection 和 Dimensionality Reduction。
需要注意，不能认为 Dual 永远比 Primal 快，因为 Dual 可能需要计算和存储 $N\times N$ 的 Kernel Matrix，当 Training Samples 很多时也会非常昂贵。考试不需要记完整的 Lagrangian 推导，重点理解 Dual 使用什么变量、为什么能够使用 Kernel，以及 Support Vectors 从哪里来。

## Soft-Margin SVM & Parameter C
- Slides P16–19 | 历年：2023B Q9、Mock Q3
现实数据经常不是 Linearly Separable，因此不能要求所有 Training Samples 都满足 $y_if(x_i)\geq1$
Soft-Margin SVM 引入 Slack Variable（松弛变量）：
$$
\boxed{y_if(x_i)\geq1-\xi_i,\quad\xi_i\geq0}
$$
- $\xi_i$ 表示样本违反 Margin Constraint 的程度。当 $\xi_i=0$ 时，样本位于 Margin 上或外侧；当 $0<\xi_i<1$ 时，样本位于 Margin 内，但仍然分类正确；当 $\xi_i=1$ 时，样本恰好位于 Decision Boundary 上；当 $\xi_i>1$ 时，样本已经被错误分类（Misclassified）。因此，$\xi_i$ 越大，表示样本违反 Margin Constraint 的程度越严重。
优化目标变成：
$$
\boxed{\min_{w,b,\xi}\frac12\|w\|^2+C\sum_i\xi_i}
$$
- 因此 Soft-Margin SVM 同时考虑两个目标：一方面尽可能增大 Margin，另一方面惩罚违反 Margin Constraint 的 Training Samples。
**Parameter C 的作用非常重要：C 控制 Margin Violations 的惩罚程度。**

| 比较 | C 大 | C 小 |
|---|---|---|
| Margin Violation Penalty | 大 | 小 |
| 对 Training Errors 的容忍度 | 低 | 高 |
| 对 Training Data 的拟合 | 更重视 | 较不重视 |
| Margin | 倾向较窄 | 倾向较宽 |
| Outlier Influence | 可能较大 | 相对较小 |
| Overfitting Risk | 可能增加 | 通常下降 |

- 这与 Lecture 3a 中 Logistic Regression 的 $C$ 有类似的直觉：$C$ 越大，越重视拟合 Training Data；$C$ 越小，Regularization 相对越强。
2023B Q9 是重要画图题：题目给出两个主要 Clusters 和少量异常点，要求画出 $C\to\infty$ 和 $C\to0^+$ 时的 Decision Boundary，并判断哪种模型可能具有更好的 Test Performance。
- 当 $C\to\infty$：Margin Violation Penalty 非常大，模型努力避免 Training Errors，可能为了拟合少量异常点而形成较复杂的 Boundary。
- 当 $C\to0^+$：模型更允许 Margin Violations，倾向于选择更宽的 Margin，不那么追随异常点。
- 对该题的数据，标准答案认为较小 $C$ 的模型可能有更好的 Test Performance，因为它不容易 Overfit Outliers。
注意：减小 $C$ 不保证 Test Accuracy 一定提高；如果 $C$ 过小，也可能造成 Underfitting。
## Hinge Loss — SVM 的 Loss Function
- Slides P19–20 | 历年：2021B Q13、Mock Q13
Slides 将 Soft-Margin SVM 写成带 Hinge Loss 的形式。首先定义 Signed Score：$z_i=y_if(x_i)$
Hinge Loss 为：
$$
\boxed{L(z)=\max(0,1-z)}
$$

| z | 分类情况 | Hinge Loss |
|---|---|---|
| `z < 0` | Misclassified | 大于 1 |
| `z = 0` | Decision Boundary | 1 |
| `0 < z < 1` | 分类正确，但在 Margin 内 | 正数 |
| `z ≥ 1` | 正确分类，且满足 Margin | 0 |

- Hinge Loss 的特点是，只有当样本正确分类并且 Margin 足够大时，Loss 才为 0。即使样本已经分类正确，只要它距离 Decision Boundary 太近，仍然可能受到惩罚。
与 Lecture 3a 中的 Logistic Loss 相比：
$$
L_{\mathrm{logistic}}(z)=\log(1+e^{-z})
$$
最大的区别是：**Hinge Loss 在 $z\geq1$ 后变成 0，不再惩罚这些样本；Logistic Loss 对任意有限的 $z$ 都大于 0。** 这也反映了两种模型的不同目标：SVM 强调 Maximum Margin，而 Logistic Regression 强调 Maximum Likelihood。

##  Kernel Trick & Non-linear Classification
- Slides P27–32 | 历年：2021A Q3、Mock Q4
Linear SVM 只能产生 Linear Decision Boundary，但现实数据有时需要 Non-linear Decision Boundary。Slides 使用 XOR、Split、Two Moons 作为例子，这些数据在原始 Feature Space 中很难用一条直线分开。
解决方法是 Feature Mapping，将原始 Feature Vector 映射到一个新的 Feature Space：
$$
\boxed{\Phi(x):\mathbb R^d\rightarrow\mathbb R^D}
$$
在新的 Feature Space 中，原本非线性可分的数据可能变得 Linearly Separable。
Kernel Trick 的关键是：SVM 的 Dual Problem 只需要计算样本之间的 Inner Product $\Phi(x_i)^T\Phi(x_j)$
因此可以定义 Kernel Function $\boxed{K(x_i,x_j)=\Phi(x_i)^T\Phi(x_j)}$
- 直接计算 Kernel Value，而不需要显式构造高维的 $\Phi(x)$。这就是 Kernel Trick：在高维 Feature Space 中执行 Linear Classification，却能在原始 Input Space 中得到 Non-linear Decision Boundary。
Kernel SVM 的预测公式：
$$
\boxed{\hat y=\operatorname{sign}\left(\sum_i\alpha_i y_iK(x_i,x)+b\right)}
$$
主要由 Non-zero $\alpha_i$ 对应的 Support Vectors 贡献预测结果。

2021A Q3 的标准答案：
- A：Kernel SVM 等价于在变换后的 Feature Space 中学习 Linear SVM。
- D：Kernel 可以定义在非向量数据上，例如 Strings、Sets，只要存在合适的合法 Kernel。
- E：与显式执行高维变换和 Inner Product 相比，Kernel Trick 在某些情况下可以节省计算和存储成本。
考试陷阱：不是任意输出正数的函数都可以作为合法 Kernel，它还必须满足额外的数学条件，例如 Positive Semi-definiteness。

## Polynomial Kernel & RBF Kernel
- Slides P31–36 | 历年：2021B Q5、2023B Q9
A. Polynomial Kernel（多项式核）
Slides 的公式是 $\boxed{K(x,x')=(x^Tx')^p}$
- 其中 $p$ 是 Polynomial Degree。当 $p=2$ 时，Kernel 可以表示二次特征交互，例如 $x_1^2,x_1x_2,x_2^2$。
Polynomial Kernel 的 Degree 决定了 Decision Boundary 的复杂程度：**Low Degree** 通常产生较简单的 Decision Boundary，而 **High Degree** 可以表示更复杂的 Polynomial Boundary。Slides 还比较了计算复杂度：显式构造二次特征可能需要 $O(d^2)$ 的计算和存储，而使用 Polynomial Kernel 可以直接计算原始 Features 的 Inner Product，使一次 Kernel Evaluation 的复杂度约为 $O(d)$。
B. RBF Kernel（径向基函数核）
$$
\boxed{K(x,x')=\exp(-\gamma\|x-x'\|^2)}
$$
其中 $\gamma>0$ 是 Inverse Bandwidth Parameter。因为 $\|x-x'\|^2$ 表示两个样本之间的 Squared Distance，所以 RBF Kernel 可以衡量样本之间的相似程度：距离越近，Kernel Value 越接近 1；距离越远，Kernel Value 越接近 0。

Gamma（$\gamma$）控制 RBF Kernel 的 Influence Range 和 Decision Boundary 的复杂度。
- **Gamma 越小，RBF Width 越宽，Kernel Influence Range 越大，Decision Boundary 越平滑**，通常 Overfitting Risk 较低，但可能 Underfit；相反，**Gamma 越大，RBF Width 越窄，Influence Range 越小，Decision Boundary 越弯曲、越复杂**，模型更容易 Overfit。Slides P34–36 展示了不同 Gamma 下 Decision Boundary 的变化。
2021B Q5（选择题）考察 RBF Kernel 与 Distance、Gamma 的关系。
- 首先，对于任意 $x$，都有 $K(x,x)=1$；当 $\gamma\to0^+$ 时，$K(x,y)\to1$；当 $\gamma\to\infty$ 时，对于两个不同的点，$K(x,y)\to0$。另外，如果 $\|x-y\|<\|x-z\|$，那么对于任意 $\gamma>0$，都有 $K(x,y)>K(x,z)$，因为 **RBF Kernel 中两个点的距离越近，Similarity 越高**。
- 重点是理解 Gamma 和 Distance 如何影响 Kernel Value。
## Positive Semi-definite Kernel（PSD Kernel）
- Slides P39 | 历年：2023B Q4
Slides 特别强调：不是任何函数都能作为 Kernel SVM 中的 Kernel Function。对于任意有限样本集合 $X=\{x_1,\ldots,x_N\}$，构造 Kernel Matrix：
$$
K_{ij}=K(x_i,x_j)
$$
一个合法的 PSD Kernel 要求 Kernel Matrix 是 Symmetric 且 Positive Semi-definite：
$$
\boxed{v^TKv\geq0,\quad\forall v}
$$
- 这保证 Kernel 可以表示为某个 Feature Space 中的 Inner Product。

2023B Q4 直接考察哪些函数是合法的 PSD Kernel，标准答案为 A、B。
- A 是 **Cosine Similarity**：$K(x,z)=\frac{x^Tz}{\|x\|\|z\|}$，它相当于先将两个非零向量归一化，再计算 Inner Product，因此是合法的 PSD Kernel。B 是 **Integral Kernel**：$K(x,y)=\int p(x\mid z)p(y\mid z)p(z)\,dz$，可以把 $p(x\mid z)\sqrt{p(z)}$ 看作 Feature Representation，因此整个积分也可以表示为 Inner Product，所以同样是合法的 PSD Kernel。
- 其他选项中的某些 Threshold、Sine、Tanh Functions 不保证满足 PSD 条件。考试不需要掌握完整的 Mercer Theorem 证明，但需要记住两个核心性质：**Kernel 可以表示为 Feature Space 中的 Inner Product**，即 $K(x_i,x_j)=\Phi(x_i)^T\Phi(x_j)$；并且对于任意有限样本构成的 Kernel Matrix，都必须满足 **Positive Semi-definiteness**，即 $v^TKv\geq0$（对任意 $v$）。

## Linear vs Kernel SVM — Memory Complexity
- Slides P14、P32 | 历年：2020 Q9、2023B Q10
2023B Q10 是一道 10 分题，专门比较 Linear SVM 和 Kernel SVM 的模型内存，因此值得重点复习。
- Linear SVM 在训练完成后，预测只需要计算 $f(x)=w^Tx+b$，因此只需要保存一个 $d$ 维的 Weight Vector $w$ 和一个 Bias $b$，模型存储复杂度为 $O(d)$，主要取决于 Feature Dimension。
- Kernel SVM 的预测公式为 $f(x)=\sum_{i\in SV}\alpha_i y_iK(x_i,x)+b$，因此需要保存 Support Vectors 和对应的 Coefficients。如果有 $M$ 个 Support Vectors，每个包含 $d$ 个 Features，那么模型存储复杂度约为 $O(Md)$，主要取决于 Support Vector Number 和 Feature Dimension。这里讨论的是训练完成后的 Model Memory；训练过程中还可能需要 $O(N^2)$ 的 Kernel Matrix。
2023B Q10 的重要结论：Linear SVM 即使使用不同的 $C$，也主要保存相同维度的 Weight Vector，因此 Memory 基本不变；Kernel SVM 的 Memory 则取决于 Support Vector 数量 $M$。在该题的实验中，较小的 $C$ 允许更多 Margin Violations，产生了更多 Support Vectors，因此需要更多 Memory。
## Multi-class SVM
- Slides P21–27、P36–38
SVM 原本主要用于 Binary Classification，但可以通过两种方法扩展到 Multi-class Classification：**One-vs-Rest (OvR)** 和 **One-vs-One (OvO)**。
- OvR 为每个类别训练一个 Binary Classifier，用来区分该类别和其余所有类别，因此 K 个类别需要 K 个分类器
- OvO 则为每两个类别训练一个 Binary Classifier，因此 K 个类别需要 K(K−1)/2 个分类器。
- 例如，对于 3 个类别，OvR 和 OvO 都需要 3 个分类器；对于 10 个类别，OvR 需要 10 个，而 OvO 需要 45 个。
Cross-validation 用于选择 SVM 的 Hyperparameters，例如 Soft-Margin Parameter $C$，以及 RBF Kernel 的 $\gamma$。

# 3c: Classification Summary
##  Feature Pre-processing（特征预处理）
Slides P3–4
Logistic Regression 和 SVM 对 Feature Scale 比较敏感。例如，一个特征的范围是 0–1，另一个是 0–10000，如果直接训练，较大尺度的特征可能对 Optimization 产生不成比例的影响。
Slides 主要介绍了两种处理方法。
A. Standardization
$$
\boxed{\tilde x=\frac{x-\mu}{\sigma}}
$$
其中 $\mu$ 是 Feature Mean，$\sigma$ 是 Standard Deviation。Standardization 使每个特征维度在 Training Set 上的 Mean 为 0、Variance 为 1。
B. Min-Max Scaling
将数据线性映射到 $[-1,1]$：
$$
\boxed{\tilde x=2\frac{x-x_{\min}}{x_{\max}-x_{\min}}-1}
$$
必须注意：**Mean、Standard Deviation、Min、Max 都必须从 Training Set 中估计，然后将同样的 Transformation 应用于 Validation/Test Set。** 不能利用 Test Set 的统计信息来调整训练过程，否则会产生 Data Leakage

## Feature Engineering & Data Representation
Slides P5–7 | 历年：2021A Q7
Feature Engineering 的核心问题是如何把原始数据转换成对 Classifier 更有用的 Features？
**A. One-hot Encoding：** 如果将 `cat`、`dog`、`horse` 分别编码成 0、1、2，就隐含了不合理的大小和距离关系。因此，可以使用：
$$
\begin{aligned}
cat&=[1,0,0]\\
dog&=[0,1,0]\\
horse&=[0,0,1]
\end{aligned}
$$

**B. Polynomial Features：** 通过增加高阶特征，可以让 Linear Classifier 学习更复杂的 Decision Boundary。例如：
$$
\boxed{
[x_1,x_2]\rightarrow
[1,x_1,x_2,x_1^2,x_1x_2,x_2^2]
}
$$
虽然分类器仍然使用 Linear Function，但由于输入 Features 包含非线性变换，因此可以在原始空间中产生 Non-linear Decision Boundary。
**2021A Q7（应用题）：** 题目描述一个 Linear Classifier 在 Training Set 和 Test Set 上都表现不好，要求分析原因并提出解决方案。标准答案认为这是 Underfitting（欠拟合），可以通过增加 Polynomial Features、改善 Feature Representation、减弱过强的 Regularization，或者使用 Kernel SVM 等 Non-linear Classifiers 解决。
- 模型 Underfit 时，不一定要更换分类算法，有时通过 Feature Engineering 就能改善模型的能力。
## Unbalanced Data（类别数量不平衡）
Slides P7–9 | 历年：2021B Q9、2021A Q10
Unbalanced Data 指 Training Set 中不同类别的样本数量差异很大。例如 Fraud Detection 中，Class 0 有 5,000 个正常交易，而 Class 1 只有 50 个欺诈交易。如果使用普通的 Classification Objective，模型可能过度关注 Majority Class，从而忽视 Minority Class。
- Slides 的主要解决方法是 Class Weighting（类别加权），即给样本较少的类别分配更大的 Weight，让模型在 Training 时更关注这一类。
**2021B Q9：** Spam 邮件比正常邮件多，导致模型将大量正常邮件误判为 Spam。可以考虑增加正常邮件的 Training Samples、提高正常邮件的 Class Weight，或者调整 Decision Threshold。
## Classifier Imbalance（不同分类错误的代价不同）
Slides P9–11 | 历年：2020 Q7、2021A Q10、2023B Q13、Mock Q10
假设在 Cancer Screening（癌症筛查）中，Positive 表示患有癌症，Negative 表示没有癌症，那么 **False Positive (FP)** 指没有癌症却被预测为有癌症，而 **False Negative (FN)** 指患有癌症却被预测为没有癌症。对于初步癌症筛查，由于后续通常还有更准确的检查，因此一般希望尽量减少 False Negatives，也就是提高 Recall，尽可能识别出真正患病的人。
**A. Increase Positive Class Weight：** 在 Training 阶段给 Positive Class 更大的 Weight，让模型更加重视正确识别 Positive Samples，从而减少漏诊。
**B. Adjust Decision Threshold：** 默认 Linear Classifier 的分类规则是：
$$
f(x)>0\Rightarrow y=+1
$$
但可以引入 Threshold $T$：
$$
\boxed{f(x)>T\Rightarrow y=+1}
$$

如果希望预测出更多 Positive Samples，可以降低 $T$，例如从 0 改为负数。对于 Logistic Regression，也可以将 Positive Class 的 Probability Threshold 从 0.5 调低。
**考试重点：** 2020 Q7 和 2023B Q13 基本是同类型问题，2021A Q10 和 Mock Q10 也高度重复。答题时首先指出两种 Classification Errors 的 Cost 不同，然后说明希望减少 FP 还是 FN，最后分别从 Training（Class Weighting）和 Prediction（Threshold Adjustment）两个阶段提出解决方案。
## Classification Loss Functions（图像分析题，极其重要）
Slides P12–13 | 历年：2020 Q8、2021A Q13、2021B Q13、Mock Q13
这是 Lecture 3c 非常重要的历年考点。Slides 比较了 Logistic Regression 和 SVM 的 Loss Functions，首先定义 $\boxed{z_i=y_if(x_i)}$
- 其中 $y_i\in\{-1,+1\}$，$f(x_i)$ 是模型的 Classification Score。因此 $z_i>0$ 表示 Correctly Classified，$z_i<0$ 表示 Misclassified，$z_i=0$ 表示样本位于 Decision Boundary。
- Logistic Loss $L_{\text{logistic}}(z)=\log(1+e^{-z})$
- Hinge Loss $L_{\text{hinge}}(z)=\max(0,1-z)$
考试不只是要求记住这两个公式，还可能给出一种从来没见过的 Loss Function 图像，让你分析它会如何影响模型。
分析任意 Classification Loss 的方法：
- **z < 0**：Misclassified Samples 受到多大惩罚？
- **0 < z < 1**：Correctly Classified 但 Margin 不足，会怎样？
- **z > 1**：已经正确分类且 Margin 足够大的样本，是否继续受到惩罚？
- **z → −∞**：严重误分类的 Outliers 是否会主导 Loss？
- **整体形状**：是否 Convex？是否容易优化？
尤其要看 Loss 的 Minimum 在哪里，以及对严重错误的样本，Loss 是不断增大还是逐渐饱和。

**A. 2020 Q8 — Minimum 在 z=1 的 U-shaped Loss**
![[Pasted image 20261012195414.png|532]]
可以理解成类似 $L(z)=(z-1)^2$
- 当 $z<1$ 时，预测越错误，Loss 越大；但当 $z>1$ 时，Loss 也会重新增加。这意味着模型不仅惩罚错误分类，还会惩罚已经正确分类且信心很高的样本，试图让它们回到 $z=1$。此外，Squared Loss 对严重 Misclassified Outliers 的惩罚增长很快，因此比较敏感。
- The minimum at z=1 will try to make the classifier predict f(x)=+1 or f(x)=-1 only.
结论：不够理想的 Classification Loss，因为它会惩罚那些已经正确分类且 Margin 很大的样本。

**B. 2021A Q13 — Minimum 在 z=1 的 V-shaped Loss**
![[Pasted image 20261012195338.png|523]]
可以理解成类似 $L(z)=|z-1|$
- 与 U-shaped Squared Loss 相比，左侧 Loss 只会线性增长，因此对严重 Misclassified Outliers 相对更加 Robust。但当 $z>1$ 时，Loss 仍增加，意味着它仍会惩罚已经正确且非常有信心的预测。
- The minimum at z=1 will try to make the classifier predict f(x)=+1 or f(x)=-1 only.
结论：相比 Squared Loss 对 Outliers 更 Robust，但仍然不是理想的 Classification Loss。

**C. 2021B Q13 — Outlier Loss Saturation**
![[Pasted image 20261012200317.png|522]]
 Loss Curve 在 $z\to-\infty$ 时逐渐变平，而在 $z\geq1$ 后变为 0。这意味着已经正确分类且 Margin 足够大的样本不再受惩罚，而对于严重 Misclassified Outliers，Loss 不会无限增大，因此降低了它们对 Training Objective 的影响。
- 优点是 Outlier Robustness 更强
- 缺点是这种 Loss 不是 Convex，训练时更容易遇到 Optimization Difficulty，不能像标准 Convex Loss 一样方便地寻找 Global Optimum。


**D. Mock Q13 — Loss 在 z≥−1 时变成 0**
![[Pasted image 20261012200819.png|516]]
对应的函数 $L(z)=\max(0,-1-z)$
- 问题是当 $z\geq-1$ 时，Loss 已经变成 0。但是在 $-1<z<0$ 时，样本实际上仍然是 Misclassified，却已经不再受到任何惩罚，因此训练没有动力继续纠正这些错误。
结论：不是好的 Classification Loss，因为它允许部分 Misclassified Samples 获得 Zero Loss。

**历年 Loss 图像题总结：**

| 题目        | Loss 特点                                 | 主要问题 / 优点                         |
| --------- | --------------------------------------- | --------------------------------- |
| 2020 Q8   | U-shaped，Minimum at z=1                 | 惩罚高信心正确预测，对 Outliers 敏感           |
| 2021A Q13 | V-shaped，Minimum at z=1                 | 对 Outliers 较 Robust，但仍惩罚高信心正确预测   |
| 2021B Q13 | Severe Misclassification Loss Saturates | Outlier Robustness 强，但 Non-convex |
| Mock Q13  | Zero Loss when z≥−1                     | 部分 Misclassified Samples 不受惩罚     |
##  Overfitting vs Underfitting
Slides P13–14 | 历年：2020 Q2/Q11、2021A Q7、2021B Q2
- Overfitting（过拟合）指模型过度拟合 Training Data，甚至学到了 Noise，导致 Generalization Performance 较差。典型表现是 Training Error 很低，但 Test Error 很高。常见解决方法包括增加 Regularization、降低 Model Complexity、使用 Cross-validation 调整 Hyperparameters，以及改善 Feature Selection。
- Underfitting（欠拟合）指模型表达能力不足，连 Training Data 中的重要规律都学不好。典型表现是 Training Error 较高，Test Error 通常也较高。常见解决方法包括降低过强的 Regularization、增加有用的 Features、引入 Polynomial Features，或者使用 Non-linear Classifiers。

| 比较 | Overfitting | Underfitting |
|---|---|---|
| Model Complexity | 可能太高 | 可能太低 |
| Training Error | 通常低 | 通常高 |
| Test Error | 高 | 高 |
| Regularization | 尝试增强 | 尝试减弱 |
| SVM Parameter C | 可以尝试减小 C | 可以尝试增大 C |
| 其他解决方法 | 减少复杂度、增加数据 | 增加 Features、使用更复杂模型 |

历年考点：2020 Q2、Q11 考察 Training Accuracy 高但 Test Accuracy 低时应该怎么办；2021A Q7 则考察 Training 和 Test Performance 都较差的情况，需要考虑 Underfitting，并改善 Feature Representation 或 Model Complexity。
- 注意，Test Error 高不一定完全由 Overfitting 导致，也可能是 Training/Test Data Distribution 不同。2021B Q2 也涉及这一点。

## Structural Risk Minimization（结构风险最小化）
Slides P14 | 历年：2020 Q11、2021A Q11
Structural Risk Minimization（SRM）是理解 Regularization 的一个统一框架。公式为：
$$
\boxed{
f^*=\arg\min_f
\underbrace{\sum_iL(y_i,f(x_i))}_{\text{Data Fit}}
+
\underbrace{\lambda\Omega(f)}_{\text{Regularization}}
}
$$
其中 $L$ 衡量模型在 Training Data 上的 Prediction Error；$\Omega(f)$ 限制模型复杂度，例如 $\|w\|_2^2$；$\lambda$ 控制 Data Fit 和 Regularization 之间的 Trade-off。
- 这里的 $\lambda$ 与之前 SVM 中的 Parameter $C$ 在方向上相反。在对应的 Objective Function 参数化下，可以将它们理解为反比关系：$\lambda$ 越大，Regularization 越强；$C$ 越大，则相对越重视减少 Training Errors。
- 这一框架将 Logistic Regression、SVM 和很多其他 Machine Learning Algorithms 联系起来：一个好的模型不仅需要拟合 Training Data，还需要限制 Model Complexity，才能获得更好的 Generalization Performance。

## Comparing Classifiers & No Free Lunch Theorem
Slides P11–12、P15 | 历年：2021A Q8
Lecture 3c 最后对 Naïve Bayes、Logistic Regression、Linear SVM 和 Kernel SVM 进行了比较。

| 比较 | Naïve Bayes | Logistic Regression | Linear SVM | Kernel SVM |
|---|---|---|---|---|
| 类型 | Generative | Discriminative | Discriminative | Discriminative |
| 学习目标 | CCD、Prior | Maximum Likelihood | Maximum Margin | Maximum Margin |
| Decision Boundary | 取决于 CCD 假设 | Linear | Linear | 可以 Non-linear |
| 主要特点 | 建模 Feature Distribution | 直接建模 Posterior | 利用 Margin 分类 | 利用 Kernel 处理非线性 |
| 重要限制 | 对模型假设敏感 | 需要调整 Regularization | 线性表达能力有限 | 对 Kernel/参数敏感，Memory 可能较大 |

- 需要注意，Naïve Bayes 不一定产生 Non-linear Decision Boundary。例如 Lecture 3a 中，Shared Variance Gaussian Naïve Bayes 就能够得到 Linear Decision Boundary。

**2021A Q8：为什么 NB、LR、SVM 都能学到 Linear Classifier，却仍然是不同的模型？哪个最准确？**
虽然三者都可能得到 $f(x)=w^Tx+b$
但它们的 Learning Objectives 不同：
- Naïve Bayes：通过估计 Class-Conditional Distribution 和 Prior，利用 Bayes' Rule 推导 Classifier。
- Logistic Regression：直接建模 Posterior Probability，并使用 Maximum Likelihood / Logistic Loss 进行训练。
- SVM：通过 Maximum Margin Principle 寻找最合适的 Decision Boundary。
对于哪个模型最准确，Slides 使用 No Free Lunch Theorem 来解释：
- 不存在一个在所有任务和数据分布上都表现最好的分类器。最终 Performance 取决于 Data Distribution、Feature Representation、Model Assumptions、Hyperparameters 和具体任务。