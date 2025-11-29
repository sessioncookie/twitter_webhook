sum = 0
max_number = 100


def show(n):
    print("第", str(n), "次執行迴圈")


for i in range(1, max_number + 1):
    show(i)
    sum += i
print("1到", str(max_number), "的總和為", str(sum))
