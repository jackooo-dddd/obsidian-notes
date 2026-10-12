## 1. Generative vs Discriminative Classifiers（生成式与判别式分类器）

Slides P1–5 | 历年：2021A Q1、2021B Q7、2023B Q8

这是 Lecture 2 和 Lecture 3a 之间最重要的联系。Generative Classifier（生成式分类器）的代表是 Naïve Bayes，它首先学习各类别的 Class-Conditional Distribution $p(x\mid y)$ 和 Prior $p(y)$，再利用 Bayes' Rule 计算 Posterior：

$$
p(y\mid x)=\frac{p(x\mid y)p(y)}{p(x)}
$$

也就是说，Generative Model 试图理解不同类别的数据是怎样生成的，再进行分类。Discriminative Classifier（判别式分类器）的代表是 Logistic Regression 和 SVM，它不需要学习整个 CCD，而是直接学习 $p(y\mid x)$ 或 Decision Boundary，从而避免复杂的密度估计问题。

| 比较 | Generative | Discriminative |
|---|---|---|
| 主要学习对象 | $p(x\mid y)$、$p(y)$ | $p(y\mid x)$ 或 Decision Boundary |
| 是否需要建模 CCD | 是 | 否 |
| 代表模型 | Naïve Bayes | Logistic Regression、SVM |
| 模型解释 | 每一类数据的典型分布 | 哪些特征有助于区分类别 |
| 数据较少时 | 分布假设合适时可能有优势 | 不保证总是更好 |

2021B Q7（10 marks）要求比较 Generative 和 Discriminative，并解释它们的可解释性。Generative Model 的 CCD 可以描述某个类别的 Typical / Prototypical Features，而 Discriminative Model 的 Weights 可以反映区分类别的重要特征（Key Differences）。Generative Model 在数据较少、分布假设适当时可能有优势，但不是绝对的。

## 2. Why Gaussian Naïve Bayes Can Be a Linear Classifier

Slides P2–5 | 历年：2023B Q8

Gaussian Naïve Bayes 假设给定类别后 Features 条件独立，并且各 Feature 服从 Gaussian Distribution。如果两个类别的所有 Features 共享相同的 Variance $\sigma^2$，假设它们的 Mean Vector 分别是：

$$
\mu=(\mu_1,\ldots,\mu_D),\qquad \nu=(\nu_1,\ldots,\nu_D)
$$

将 Gaussian CCD 代入 Bayesian Decision Rule，比较两个类别的 Log-Posterior 后，二次项会相互抵消，最终得到 Linear Classifier：

$$
\boxed{f(x)=w^Tx+b}
$$

其中：

$$
w_i=\frac{\mu_i-\nu_i}{\sigma^2}
$$

$$
b=\frac{1}{2\sigma^2}\sum_i(\nu_i^2-\mu_i^2)+\log\frac{\pi_1}{\pi_2}
$$

这里 $\pi_1,\pi_2$ 是两个类别的 Prior Probabilities。重点是：**在 Shared Variance Gaussian Assumption 下，Gaussian NB 可以得到 Linear Decision Boundary，但它仍然是 Generative Model。**

Naïve Bayes 先估计 $\mu,\nu,\sigma^2,\pi$，然后推导 $w,b$；Logistic Regression 则直接通过分类目标学习 $w,b$。因此，两者都可以是 Linear Classifiers，但训练原理不同。如果两个类别的 Variance 不同，Gaussian NB 的 Decision Boundary 还可能是 Nonlinear。

2023B Q8 就考察了这一点。考试重点是理解 Shared Variance Assumption、Linear Decision Boundary 和两种模型的学习方式，不需要死记完整的 Gaussian 展开推导。

## 3. Linear Classifier & Decision Boundary（线性分类器）

Slides P5–8 | 历年：2021A Q8、2021B Q1

Linear Classifier 的基本形式为：

$$
\boxed{f(x)=w^Tx+b}
$$

其中 $w$ 是 Feature Weights，$b$ 是 Bias。对于 $y\in\{-1,+1\}$，分类规则为：

$$
\hat y=
\begin{cases}
+1,&f(x)>0\\
-1,&f(x)<0
\end{cases}
$$

Decision Boundary（决策边界）位于两个类别的分界位置：

$$
\boxed{w^Tx+b=0}
$$

需要理解三个性质：$w$ 控制 Decision Boundary 的方向，并且垂直于边界（Normal Vector）；$b$ 控制边界的位置；当 Feature Dimension 为 $D$ 时，Decision Boundary 是一个 $D-1$ 维的 Hyperplane。例如二维空间中的 Decision Boundary 是一条直线，三维空间中则是一个平面。

考试常问：为什么 Logistic Regression 使用非线性的 Sigmoid Function，却仍然是 Linear Classifier？因为 Sigmoid 只是把线性分数 $f(x)$ 转换成概率，当 Classification Threshold 为 0.5 时，Decision Boundary 仍然满足 $f(x)=0$，所以边界还是 Linear。

## 4. Logistic Regression & Sigmoid Function（逻辑回归与概率）

Slides P8–10 | 历年：2023B Q2、Mock Q2

Logistic Regression 在 Linear Classifier 的基础上增加 Sigmoid Function，将任意实数的 $f(x)$ 映射到 0 到 1 之间的概率：

$$
\boxed{\sigma(z)=\frac{1}{1+e^{-z}}}
$$

因此：

$$
p(y=+1\mid x)=\sigma(w^Tx+b)
$$

$$
p(y=-1\mid x)=1-\sigma(w^Tx+b)
$$

| $f(x)$ | $p(y=+1\mid x)$ | 预测 |
|---|---|---|
| $f(x)>0$ | 大于 0.5 | Class +1 |
| $f(x)=0$ | 等于 0.5 | Decision Boundary |
| $f(x)<0$ | 小于 0.5 | Class −1 |

Sigmoid 有一个重要性质：

$$
\boxed{1-\sigma(z)=\sigma(-z)}
$$

因此，当 $y\in\{-1,+1\}$ 时，可以用一个公式同时表示两个类别：

$$
\boxed{p(y\mid x)=\sigma(yf(x))}
$$

这个公式也是后面推导 Logistic Loss 的基础。考试重点：Logistic Regression 虽然叫 Regression，但这里用于 Classification；它直接建模 Posterior Probability $p(y\mid x)$，而不是 Class-Conditional Distribution $p(x\mid y)$。

## 5. Maximum Likelihood Estimation & Logistic Loss

Slides P10–12 | 历年：2020 Q1、Mock Q8

Logistic Regression 使用 Maximum Likelihood Estimation（MLE）学习 $w,b$，目标是让 Training Data 中真实标签出现的概率尽可能大：

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

这里定义：

$$
\boxed{z_i=y_if(x_i)}
$$

Logistic Loss Function 为：

$$
\boxed{L(z_i)=\log(1+e^{-z_i})}
$$

其中 $z_i$ 可以理解成 Signed Classification Score，它同时考虑了真实标签 $y_i$ 和模型预测分数 $f(x_i)$。

| 情况 | 含义 | Logistic Loss |
|---|---|---|
| $z<0$ | Incorrectly Classified | 较大，错误越严重 Loss 越大 |
| $z=0$ | Decision Boundary | $\log 2$ |
| $z>0$ | Correctly Classified | 较小，$z$ 越大越接近 0 |

需要注意，即使一个样本已经被正确分类，它的 Logistic Loss 通常也不是 0，而是随着 $z$ 增大逐渐接近 0。

考试可能问：为什么 Logistic Loss 会惩罚 Misclassified Samples？因为错误分类时 $y_if(x_i)<0$，而且错误越严重，$z_i$ 越负，$L(z_i)$ 就越大。最小化 Logistic Loss 会鼓励模型提高真实类别的预测概率。Mock Q8 要求解释 Objective Function 中 Logistic Loss Term 的作用。

## 6. L2 Regularization & Gaussian Prior（重点）

Slides P12–17 | 历年：2021A Q5、2023B Q2、Mock Q8

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

从概率角度来说，加入 Prior 后是在做 Maximum a Posteriori Estimation（MAP），而不再只是 MLE。

Data Fit Term 让模型尽可能正确地预测 Training Data；Regularization Term 限制 Weights 的大小，降低模型复杂度，从而减少 Overfitting。

**参数 $C$ 的作用非常重要。** Slides 使用 $C$，但 Mock Q8 使用 $\alpha$ 作为直接乘在 L2 Penalty 前面的系数：

$$
\alpha\|w\|_2^2+\sum_iL_i
$$

对于这两种写法：

$$
\boxed{\alpha=\frac1C}
$$

| 比较 | $C$ 增大 | $C$ 减小 |
|---|---|---|
| Regularization Strength | 减弱 | 增强 |
| Weight Magnitude | 允许更大 | 倾向更小 |
| Model Complexity | 倾向更复杂 | 倾向更简单 |
| Overfitting Risk | 增加 | 减少 |
| Posterior Probability | 更容易接近 0/1 | 较不容易饱和 |

**一定注意：$C$ 和 $\alpha$ 的方向相反。** 如果题目使用 $\alpha$ 直接乘 L2 Penalty，那么 $\alpha$ 越大，Regularization 越强；但如果使用 $\frac1C$，则 $C$ 越大，Regularization 越弱。

历年考点：2021A Q5 考 L2 Prevent Overfitting 和 Gaussian Prior（答案 B、D）；2023B Q2 考 Gaussian Prior 与 Regularization（答案 B、C、D）；Mock Q8 要求解释 $\alpha$ 增大或减小时，Weights 与 Model Complexity 如何变化。

## 7. Optimization & Gradient Descent

Slides P13 | 历年：2023B Q2

Logistic Regression 的优化目标通常没有 Closed-form Solution（闭式解），因此需要使用 Iterative Optimization Algorithms，例如 Gradient Descent。Slides 的更新公式为：

$$
\boxed{w\leftarrow w-\eta\frac{dE}{dw}}
$$

其中 $E$ 是 Objective Function，$\eta$ 是 Learning Rate。每次迭代沿着 Gradient 的反方向更新 Weights，逐步降低 Loss。Learning Rate 控制每次参数更新的步长，太大可能导致训练不稳定，太小则可能导致收敛缓慢。

需要知道：标准 Logistic Regression 的 Negative Log-Likelihood 是 Convex Function，因此不会出现非全局的局部最小值，但并不能无条件保证每个数据集都有唯一且有限的最优解。2023B Q2 的选项 A 声称 Logistic Regression 有 Closed-form MLE Solution，标准答案判定为 False。考试主要理解为什么需要迭代优化，以及 Gradient Descent 的工作原理，不需要记训练代码。

## 8. Cross-validation（交叉验证）

Slides P17–19 | 历年：2020 Q4、2021A Q11

Cross-validation 用来选择 Hyperparameters，例如 Regularization Parameter $C$ 或 $\alpha$。Slides 介绍的是 K-fold Cross-validation：先把 Training Data 分为 $K$ 份，每次用其中一份作为 Validation Set，其余 $K-1$ 份用于训练，最后计算各个 Hyperparameter 的平均 Validation Performance。

5-Fold Cross-validation 示例：

| Fold | Part 1 | Part 2 | Part 3 | Part 4 | Part 5 |
|---|---|---|---|---|---|
| 1 | Val | Train | Train | Train | Train |
| 2 | Train | Val | Train | Train | Train |
| 3 | Train | Train | Val | Train | Train |
| 4 | Train | Train | Train | Val | Train |
| 5 | Train | Train | Train | Train | Val |

最后选择平均 Validation Accuracy 最高的 $C$：

$$
\boxed{
C^*=\arg\max_C\frac1K\sum_{k=1}^{K}\mathrm{Accuracy}_k(C)
}
$$

选定 $C$ 后，再使用整个 Training Set 重新训练模型，最后通过 Test Set 评估 Generalization Performance。

| Dataset | 作用 |
|---|---|
| Training Set | 学习模型参数 $w,b$ |
| Validation Set | 选择 Hyperparameters，例如 $C$ |
| Test Set | 最终评估 Generalization Performance |

**不要使用 Test Set 来选择 $C$**，否则会导致 Test Information Leakage 和评估偏差。

2020 Q4 考察了 Cross-validation 的正确说法，标准答案为 A、C、D。重点包括：Validation Set 来自 Training Data；在 Validation Data 上表现最好的 Hyperparameter，不保证在 Test Data 上也一定最好。Slides P19 的例子选择了 $C\approx4.28$，不需要记这个具体数值，只需要理解选择过程。

## 9. Multi-class Classification — One-vs-Rest

Slides P19–22 | 历年：Mock Q2

前面介绍的 Logistic Regression 主要是 Binary Classifier，即一次区分两个类别。如果有 $K$ 个类别，Slides 介绍了 One-vs-Rest（OvR）方法：训练 $K$ 个 Binary Classifiers，每个分类器负责区分某一类和其他所有类别。

例如有三个类别：

| Classifier | 任务 |
|---|---|
| Classifier 1 | Class 1 vs Classes 2, 3 |
| Classifier 2 | Class 2 vs Classes 1, 3 |
| Classifier 3 | Class 3 vs Classes 1, 2 |

最后比较各个 Classifier 对对应类别的预测分数或概率，选择最高的类别。

Mock Q2 考察：如果有三个类别，是否只需要两个 OvR Decision Boundaries？答案是 **False**，因为 OvR 需要训练三个 Binary Classifiers。一般来说：

$$
\boxed{K\text{ classes}\rightarrow K\text{ binary classifiers}}
$$

## 10. Multiclass Logistic Regression — Softmax & Cross-Entropy

Slides P23–26 | 多分类相关知识

除了 OvR，还可以直接定义一个 Multiclass Objective，联合训练所有类别的参数。首先给每个 Class $c$ 定义一个 Linear Score：

$$
f_c(x)=w_c^Tx+b_c
$$

然后使用 Softmax Function 将这些分数转换为概率：

$$
\boxed{
p(y=c\mid x)=
\frac{e^{f_c(x)}}{\sum_{j=1}^{K}e^{f_j(x)}}
}
$$

Softmax 可以看作 Sigmoid 在 Multiclass Classification 中的对应扩展，它保证所有类别的概率加起来等于 1：

$$
\sum_{c=1}^{K}p(y=c\mid x)=1
$$

最终选择概率最大的类别，因为 Softmax 不改变各类别 Score 的排序，所以也可以直接比较 Linear Scores：

$$
\boxed{\hat y=\arg\max_c f_c(x)}
$$

训练时使用 Maximum Likelihood Estimation，如果真实标签采用 One-hot Encoding，就会得到 Cross-Entropy Loss：

$$
\boxed{L=-\sum_{c=1}^{K}y_c\log p(y=c\mid x)}
$$

其中 $y_c=1$ 表示真实类别为 $c$，其余类别对应的 $y_c=0$。因此 Cross-Entropy 实际上就是对真实类别预测概率取 Negative Log。

| 比较 | One-vs-Rest | Multinomial Logistic Regression |
|---|---|---|
| 训练方式 | 训练 $K$ 个独立 Binary Classifiers | 联合训练所有类别 |
| Probability Function | 每个分类器使用 Sigmoid | 所有类别共同使用 Softmax |
| 分类方式 | 比较各 Binary Classifiers 的输出 | 比较 Softmax Probabilities |
| Training Objective | 多个 Binary Logistic Loss | Multiclass Cross-Entropy |

这一部分在已有题库中直接考察不多，但 Softmax 和 Cross-Entropy 是 Slides 明确介绍的理论，建议掌握公式及意义，不需要记 sklearn 实验代码。

## 11. L1 vs L2 Regularization（考试额外补充）

历年：2020 Q12a、Q12b、2021A Q11

虽然 Lecture 3a Slides 主要介绍 L2，但历年 Midterm 多次考察 L1 Regularization，因此需要同时掌握。

L1 Regularization 使用 Weight Absolute Values 的总和：

$$
\boxed{\|w\|_1=\sum_j|w_j|}
$$

L1 倾向于让某些 Weights 变成精确的 0，因此能够实现 Feature Selection。如果将 Logistic Regression 的 L2 Penalty 换成 L1，目标函数就变成：

$$
\boxed{
\min_{w,b}
\frac1C\|w\|_1+
\sum_i\log(1+e^{-y_if(x_i)})
}
$$

这就是 2020 Q12a 要求写出的公式。

2020 Q12b 进一步要求根据 L1 Regularization 画 Decision Boundary。假设模型只有两个 Features：

$$
f(x)=w_1x_1+w_2x_2+b
$$

如果 L1 让 $w_1=0$，那么 Decision Boundary 变成：

$$
w_2x_2+b=0
$$

即：

$$
x_2=-\frac b{w_2}
$$

因此得到一条水平线，因为模型的预测不再依赖 $x_1$。相反，如果 $w_2=0$，那么：

$$
x_1=-\frac b{w_1}
$$

Decision Boundary 就是一条竖直线。因此，L1 可能产生与坐标轴平行的 Decision Boundary，这对应于通过选择重要 Features、忽略其他 Features 来分类

| 比较 | L1 Regularization | L2 Regularization |
|---|---|---|
| Penalty | ∑ⱼ abs(wⱼ) | ∑ⱼ wⱼ² |
| Weights | 某些可以精确等于 0 | 通常缩小，但不精确等于 0 |
| Feature Selection | 可以 | 通常不能直接完成 |
| Prevent Overfitting | 可以 | 可以 |
| 典型效果 | Sparse Weights | Shrink Weights |

**考试最重要的区别：L1 倾向于产生 Sparse Weights，能够进行 Feature Selection；L2 主要让 Weights 变小，但通常不会直接变成 0。**